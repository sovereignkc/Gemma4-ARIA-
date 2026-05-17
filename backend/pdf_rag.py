# pdf_rag.py — PDF RAG pipeline
#
# Flow: PDF → PyMuPDF text extraction → chunk → nomic-embed → ChromaDB
# Query: embed query → cosine top-3 → inject into Gemma 4 moonshot prompt
#
# In-memory ChromaDB (resets on server restart — intentional, per spec)

from __future__ import annotations
import re
import threading
import uuid
from pathlib import Path
from typing import Optional

import chromadb
import fitz  # PyMuPDF

import ollama_client as ollama

# ── Singleton ChromaDB in-memory client ───────────────────────────────────────

_lock = threading.Lock()
_client: Optional[chromadb.Client] = None
_collection: Optional[chromadb.Collection] = None

# Maps collection_name → document metadata for the frontend to list
_doc_registry: dict[str, dict] = {}


def _get_collection() -> chromadb.Collection:
    global _client, _collection
    with _lock:
        if _client is None:
            _client = chromadb.Client()  # in-memory
            _collection = _client.get_or_create_collection(
                name="documents",
                metadata={"hnsw:space": "cosine"},
            )
    return _collection


# ── PDF ingestion ─────────────────────────────────────────────────────────────

def _pdf_to_pages_text(pdf_path: str) -> list[tuple[int, str]]:
    """Extract text from each PDF page using PyMuPDF. Returns [(page_num, text), ...]."""
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc, start=1):
        text = page.get_text("text")
        if text.strip():
            pages.append((i, text))
    doc.close()
    return pages


def _chunk_text(text: str, page_num: int, chunk_size: int = 400, overlap: int = 60) -> list[dict]:
    """Split text into overlapping chunks, each tagged with page number."""
    # Clean up whitespace
    text = re.sub(r'\n{3,}', '\n\n', text.strip())
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i:i + chunk_size]
        chunk_text = " ".join(chunk_words)
        if len(chunk_text.strip()) > 20:  # skip trivially short chunks
            chunks.append({"text": chunk_text, "page": page_num})
        i += chunk_size - overlap
    return chunks


def ingest_pdf(pdf_path: str, doc_name: str) -> dict:
    """
    Full ingestion pipeline:
      PDF pages → JPEG → GLM-OCR → chunk → nomic-embed → ChromaDB

    Returns {"doc_id", "doc_name", "pages", "chunks", "status"}
    """
    collection = _get_collection()
    doc_id = str(uuid.uuid4())[:8]
    pages = _pdf_to_pages_text(pdf_path)
    n_pages = len(pages)

    all_chunks = []
    for page_num, page_text in pages:
        if page_text.strip():
            all_chunks.extend(_chunk_text(page_text, page_num))

    if not all_chunks:
        return {"doc_id": doc_id, "doc_name": doc_name, "pages": n_pages, "chunks": 0, "status": "no_text"}

    # Embed all chunks in batch
    texts = [c["text"] for c in all_chunks]
    embeddings = ollama.embed(texts)

    # Store in ChromaDB
    collection.add(
        ids=[f"{doc_id}_c{i}" for i in range(len(all_chunks))],
        embeddings=embeddings,
        documents=texts,
        metadatas=[{"doc_id": doc_id, "doc_name": doc_name, "page": c["page"]} for c in all_chunks],
    )

    _doc_registry[doc_id] = {"doc_id": doc_id, "doc_name": doc_name, "pages": n_pages, "chunks": len(all_chunks)}
    print(f"[RAG] Ingested '{doc_name}': {n_pages} pages, {len(all_chunks)} chunks → ChromaDB total: {collection.count()}")
    return {**_doc_registry[doc_id], "status": "ok"}


# ── Query ─────────────────────────────────────────────────────────────────────

def query(text: str, top_k: int = 3, doc_id: Optional[str] = None) -> dict:
    """
    Embed query → retrieve top-k chunks → return context string + source metadata.
    If doc_id given, restrict search to that document.
    """
    collection = _get_collection()
    if collection.count() == 0:
        return {"context": "", "sources": []}

    query_embedding = ollama.embed([text])[0]

    where = {"doc_id": doc_id} if doc_id else None
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    docs = results["documents"][0]
    metas = results["metadatas"][0]
    sources = [{"doc_name": m["doc_name"], "page": m["page"]} for m in metas]

    # Debug: confirm chunks are arriving
    print(f"[RAG] Retrieved {len(docs)} chunks for: '{text[:60]}…'")
    for i, (d, m) in enumerate(zip(docs, metas)):
        print(f"[RAG]   chunk {i+1}: {m['doc_name']} p{m['page']} — {d[:80].strip()}…")

    # Format that Gemma 4 models reliably follow
    chunk_blocks = "\n\n".join(
        f"[{m['doc_name']}, page {m['page']}]\n{d.strip()}"
        for d, m in zip(docs, metas)
    )
    context = f"Context from uploaded document:\n\n{chunk_blocks}"
    return {"context": context, "sources": sources}


def list_documents() -> list[dict]:
    return list(_doc_registry.values())


def delete_document(doc_id: str) -> bool:
    collection = _get_collection()
    try:
        # ChromaDB: delete by metadata filter
        results = collection.get(where={"doc_id": doc_id})
        if results["ids"]:
            collection.delete(ids=results["ids"])
        _doc_registry.pop(doc_id, None)
        return True
    except Exception:
        return False
