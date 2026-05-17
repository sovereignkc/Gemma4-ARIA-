"""
DeepSeek V4 Flash — Moonshot STEM CoT Dataset Generator
Generates 500 examples overnight, saves incrementally to JSONL
Run: python generate_dataset.py --api-key YOUR_KEY --n 500
"""

import os
import json
import time
import random
import argparse
from openai import OpenAI

# ── CONFIG ──────────────────────────────────────────────────────────────────
MODEL = "deepseek-v4-flash"
BASE_URL = "https://api.deepseek.com"
OUTPUT_FILE = "infra_cot_generated.jsonl"
DELAY_BETWEEN_CALLS = 1.2  # seconds — avoids rate limiting

# ── TOPIC POOL ───────────────────────────────────────────────────────────────
TOPICS = [
    # WATER
    ("water", "disinfection", "SODIS with polycarbonate vs PET bottles at different turbidity levels"),
    ("water", "filtration", "biosand filter construction and maturation timeline"),
    ("water", "storage", "household water storage safety and recontamination prevention"),
    ("water", "dosing", "chlorine tablet dosing for different water volumes and turbidity"),
    ("water", "math", "rain catchment calculation for metal vs thatched roof"),
    ("water", "pasteurization", "WAPI-based pasteurization without thermometer"),
    ("water", "solar still", "solar still construction and daily yield calculation"),
    ("water", "groundwater", "hand-dug well siting and contamination risk assessment"),
    ("water", "flood", "floodwater treatment protocol with multiple contamination types"),
    ("water", "distribution", "gravity-fed piped system sizing for 200-person village"),
    ("water", "quality", "detecting chemical vs biological contamination without lab tools"),
    ("water", "altitude", "boiling and pasteurization adjustments at 2500m and 4000m"),

    # ELECTRICITY
    ("electricity", "solar sizing", "PV system sizing for clinic with vaccine refrigerator"),
    ("electricity", "battery", "lead-acid vs lithium battery tradeoffs for off-grid village"),
    ("electricity", "wiring", "series vs parallel panel configuration for 48V bus"),
    ("electricity", "charge controller", "MPPT vs PWM controller selection criteria"),
    ("electricity", "micro-hydro", "Pelton wheel sizing for 5m head, 15 L/s stream"),
    ("electricity", "wind", "small wind turbine siting and Betz limit application"),
    ("electricity", "thermoelectric", "campfire TEG output calculation and cold-side cooling"),
    ("electricity", "biogas-electric", "biogas-powered generator sizing for 50-household community"),
    ("electricity", "load management", "priority load shedding protocol during low battery"),
    ("electricity", "safety", "DC arc flash prevention and grounding for off-grid systems"),
    ("electricity", "salvage", "car alternator rewinding for low-RPM micro-hydro application"),
    ("electricity", "stirling", "dish-Stirling concentrating solar system for village power"),

    # FOOD
    ("food", "caloric math", "emergency ration planning for 500-person camp over 30 days"),
    ("food", "preservation", "lactic acid fermentation of vegetables in tropical climate"),
    ("food", "salt curing", "dry salt curing fish for 3-week shelf life"),
    ("food", "solar drying", "food dehydration time and temperature for pathogen safety"),
    ("food", "botulism", "anaerobic preservation failure modes and prevention"),
    ("food", "wild plants", "universal edibility test protocol step by step"),
    ("food", "sprouts", "seed sprouting timeline and nutrition for disaster nutrition gap"),
    ("food", "ORS", "oral rehydration salt preparation and pediatric dosing"),
    ("food", "malnutrition", "MUAC measurement and acute malnutrition classification"),
    ("food", "food safety", "safe internal cooking temperatures without thermometer"),
    ("food", "crop fast", "fastest-germinating crops for post-disaster food production"),
    ("food", "water activity", "water activity science behind salt and sugar preservation"),
    
    # MOONSHOT / NEXT-GEN SYSTEMS
    ("moonshot", "desalination", "solar-powered membrane desalination with heat recovery"),
    ("moonshot", "atmospheric water", "fog-harvesting mesh design and yield estimation"),
    ("moonshot", "cold chain", "off-grid vaccine cold-chain with phase-change backup"),
    ("moonshot", "wastewater", "modular anaerobic wastewater treatment for small settlements"),
    ("moonshot", "biochar", "biochar kiln design and soil amendment dosing"),
    ("moonshot", "compost heat", "compost-based thermal water heating system"),
    ("moonshot", "agri irrigation", "drip irrigation scheduling from crop evapotranspiration"),
    ("moonshot", "hydroponics", "low-cost hydroponic nutrient balance and pH control"),
    ("moonshot", "aquaculture", "recirculating aquaculture system oxygen and ammonia control"),
    ("moonshot", "protein", "single-cell protein production from local biomass"),
    ("moonshot", "telemedicine", "store-and-forward telemedicine relay under low bandwidth"),
    ("moonshot", "diagnostics", "paper-based rapid diagnostic workflow for field clinics"),
    ("moonshot", "sterilization", "solar thermal sterilizer temperature-time validation"),
    ("moonshot", "air quality", "indoor particulate reduction with improved cookstove ventilation"),
    ("moonshot", "building", "passive house cooling with shaded ventilation and thermal mass"),
    ("moonshot", "recycling", "plastic sorting and melt-processing safety constraints"),
    ("moonshot", "battery recycling", "safe lead-acid battery recovery and acid neutralization"),
    ("moonshot", "microgrids", "DC microgrid protection and load prioritization"),
    ("moonshot", "storage", "sand battery or thermal brick storage for evening heat"),
    ("moonshot", "hydrogen", "small-scale hydrogen storage safety and leak management"),
    ("moonshot", "ammonia", "green ammonia concept for fertilizer production"),
    ("moonshot", "fertilizer", "nutrient recovery from urine and compost streams"),
    ("moonshot", "disease surveillance", "symptom and wastewater surveillance for outbreak early warning"),
    ("moonshot", "sensors", "low-power environmental sensor network with LoRa relay"),
    ("moonshot", "lighting", "solar LED microenterprise lighting system sizing"),
    ("moonshot", "communications", "mesh radio relay for emergency village communications"),
    ("moonshot", "evacuation", "flood evacuation route optimization and shelter capacity"),
    ("moonshot", "food processing", "low-energy milling, drying, and packaging line design"),
    ("moonshot", "seed storage", "hermetic seed storage moisture control and viability"),
    ("moonshot", "carbon", "community carbon accounting for cookstoves and fuels"),

    # SHELTER & ENVIRONMENT
    ("shelter", "insulation", "R-value calculation for improvised wall materials"),
    ("shelter", "passive cooling", "Zeer pot evaporative cooler performance in humid vs dry climates"),
    ("shelter", "underground storage", "root cellar temperature physics and construction"),
    ("shelter", "fire", "fire triangle and sustained combustion in wet tropical conditions"),
    ("shelter", "structural", "debris shelter load calculation for snow and rain"),
    ("shelter", "ventilation", "smoke ventilation design for enclosed cooking spaces"),

    # MEDICAL
    ("medical", "wound care", "wound irrigation pressure and volume calculation"),
    ("medical", "tourniquet", "improvised tourniquet physics and pressure threshold"),
    ("medical", "fever", "evaporative cooling physics for fever management without medication"),
    ("medical", "honey", "osmotic antimicrobial mechanism of honey for wound care"),
    ("medical", "infection", "infection progression timeline and antibiotic decision threshold"),
    ("medical", "dehydration", "clinical dehydration assessment without lab equipment"),

    # HUMANITARIAN SYSTEMS
    ("humanitarian", "camp water", "Sphere standard water point density for 2000-person camp"),
    ("humanitarian", "latrine design", "pit latrine design for clay soil with high water table"),
    ("humanitarian", "cholera response", "72-hour cholera outbreak containment protocol"),
    ("humanitarian", "food distribution", "equitable ration distribution system for 5000 people"),
    ("humanitarian", "health post", "minimum viable community health post supply kit"),
    ("humanitarian", "coordination", "sector lead assignment and daily coordination meeting structure"),
    ("humanitarian", "mortality tracking", "crude mortality rate calculation and emergency thresholds"),
    ("humanitarian", "seed bank", "community seed bank construction and governance"),

    # MOONSHOT / ADVANCED ENERGY
    ("moonshot", "biogas digester", "co-digestion of food waste and fecal sludge for community biogas"),
    ("moonshot", "molten salt", "molten salt thermal storage physics and community feasibility"),
    ("moonshot", "TPV", "thermophotovoltaic system with photonic crystal emitter for biomass"),
    ("moonshot", "micro-nuclear", "SMR passive safety mechanisms and community-scale feasibility"),
    ("moonshot", "thorium", "thorium fuel cycle advantages and current deployment barriers"),
    ("moonshot", "electrolysis", "water electrolysis for hydrogen production with solar input"),
    ("moonshot", "FM radio", "low-power FM transmitter construction for emergency broadcast"),
    ("moonshot", "carnot", "Carnot efficiency application to field heat engine selection"),
    ("moonshot", "microgrid", "integrated solar-hydro-biogas-wind village microgrid design"),
    ("moonshot", "composting loop", "waste-to-biogas-to-fertilizer closed loop for 200 households"),
    ("moonshot", "thermionic", "thermionic emission for waste heat recovery in field conditions"),
    ("moonshot", "archimedes screw", "Archimedes screw micro-hydro for ultra-low head streams"),
    ("moonshot", "phase change", "phase change material thermal storage for food preservation"),
    ("moonshot", "atmospheric water", "atmospheric water generation from fog and humidity"),
    ("moonshot", "aquaponics", "integrated fish-plant aquaponics system for protein and vegetables"),
    ("moonshot", "gasification", "biomass gasification for producer gas cooking fuel"),
]

# ── SYSTEM PROMPT ────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are an expert humanitarian engineer and applied scientist. 
You generate training data for an AI assistant that helps disaster survivors and remote communities with STEM-grounded practical knowledge.

Every response you generate must follow this EXACT format:

Given:
- [list the known inputs, parameters, context]

Formula / rule:
- [state the relevant physics, chemistry, biology, engineering principle]
- [show the math with actual numbers where applicable]
- [cite the mechanism, not just the answer]

Result:
- [clear actionable answer with numbers]
- [be specific — quantities, times, temperatures, ratios]

Safety note:
- [1-3 critical safety constraints or failure modes]
- [what not to do and why]

If uncertain / escalate:
- [when this approach fails and what to do instead]
- [signs that the situation exceeds this solution's capability]

Rules:
- ALL scientific claims must be accurate and grounded in real chemistry/physics/engineering
- Include actual numbers, formulas, and units — not vague estimates
- Write for a smart non-expert (field worker, community leader, older child)
- Never oversimplify to the point of being wrong
- Each example should be a DIFFERENT specific scenario within the topic
- Do NOT repeat examples from your context"""

# ── GENERATION ───────────────────────────────────────────────────────────────
def generate_example(client, category, problem_type, topic, index):
    """Generate one CoT example for a given topic."""
    
    # Vary the question framing to get diversity
    framings = [
        f"We are in a disaster zone. {topic}. Give me the full technical breakdown.",
        f"A community leader asks: how do we handle {topic}? Give specific numbers and steps.",
        f"Explain the science and practical steps for {topic} in a resource-limited setting.",
        f"We have no electricity, limited tools. Walk me through {topic} step by step with the math.",
        f"A child asks why {topic} matters and how to do it. Explain the science simply but accurately.",
        f"Emergency scenario: {topic}. What are the key calculations and decisions?",
    ]
    
    question = random.choice(framings)
    
    # Add some specificity to force variety
    specifics = [
        " Assume tropical climate, flood scenario.",
        " Assume mountainous terrain, earthquake aftermath.",
        " Assume coastal area, typhoon recovery.",
        " Assume arid region, drought conditions.",
        " Assume sub-Saharan Africa context, rainy season.",
        " Assume Southeast Asia, monsoon season.",
        " Population size: 50-500 people.",
        " Available materials: only salvaged/local resources.",
    ]
    
    question += random.choice(specifics)
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question}
    ]
    
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        max_tokens=800,
        temperature=0.85,  # some variation but not hallucination-prone
        top_p=0.95,
    )
    
    answer = response.choices[0].message.content.strip()
    
    return {
        "messages": [
            {"role": "user", "content": question},
            {"role": "assistant", "content": answer}
        ],
        "metadata": {
            "category": category,
            "problem_type": problem_type,
            "topic": topic,
            "index": index,
            "model": MODEL
        }
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", required=True, help="DeepSeek API key")
    parser.add_argument("--n", type=int, default=500, help="Number of examples to generate")
    parser.add_argument("--output", default=OUTPUT_FILE, help="Output JSONL file")
    parser.add_argument("--resume", action="store_true", help="Resume from existing file")
    args = parser.parse_args()

    client = OpenAI(
        api_key=args.api_key,
        base_url=BASE_URL
    )

    # Resume logic — count existing lines
    start_index = 0
    if args.resume and os.path.exists(args.output):
        with open(args.output, "r") as f:
            start_index = sum(1 for _ in f)
        print(f"Resuming from example {start_index}")

    print(f"Generating {args.n - start_index} examples → {args.output}")
    print(f"Model: {MODEL} | Estimated cost: ~${((args.n * 300 * 0.14) + (args.n * 500 * 0.28)) / 1_000_000:.3f}")

    success = 0
    errors = 0

    with open(args.output, "a") as f:
        for i in range(start_index, args.n):
            # Cycle through topics with randomization
            topic_entry = TOPICS[i % len(TOPICS)]
            category, problem_type, topic = topic_entry

            try:
                example = generate_example(client, category, problem_type, topic, i)
                f.write(json.dumps(example) + "\n")
                f.flush()  # write immediately — safe for overnight runs
                success += 1

                if success % 10 == 0:
                    print(f"[{i+1}/{args.n}] ✓ {success} generated, {errors} errors | topic: {topic[:40]}")

                time.sleep(DELAY_BETWEEN_CALLS)

            except Exception as e:
                errors += 1
                print(f"[{i+1}/{args.n}] ✗ Error on '{topic}': {e}")
                time.sleep(3)  # back off on error
                continue

    print(f"\nDone. {success} examples saved to {args.output}")
    print(f"Errors: {errors}")


if __name__ == "__main__":
    main()