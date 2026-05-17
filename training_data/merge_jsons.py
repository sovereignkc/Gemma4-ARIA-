import json

def merge_json_files(files, output_file):
    merged_data = []
    for file in files:
        with open(file, 'r') as f:
            for line_number, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue  # Skip empty lines
                try:
                    data = json.loads(line)
                    merged_data.append(data)
                except json.JSONDecodeError as e:
                    print(f"Error decoding JSON from {file} at line {line_number}: {e}")
                    continue

    with open(output_file, 'w') as out_file:
        json.dump(merged_data, out_file, indent=4)

if __name__ == "__main__":
    files = [
        '/Users/kc/Gemma4InspirationSolveDROptimalSight_Disaster_Climate_MoonshotFoodWaterElectricityGen/training_data/infra_cot_generated.jsonl',
        '/Users/kc/Gemma4InspirationSolveDROptimalSight_Disaster_Climate_MoonshotFoodWaterElectricityGen/training_data/infra_cot_moonshot.jsonl',
        '/Users/kc/Gemma4InspirationSolveDROptimalSight_Disaster_Climate_MoonshotFoodWaterElectricityGen/training_data/infra_cot_seed.jsonl'
    ]
    output_file = 'merged_water_infrastucture_moonshot_output.json'

    merge_json_files(files, output_file)
    print(f'Successfully merged data into {output_file}')