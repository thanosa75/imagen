#!/bin/bash

# Bulk Image Processing Script for Gemini Image Processing API
echo "***************************************************"
echo "THIS IS LARGERLY UNTESTED" 
echo "***************************************************"
# 1. Input Argument Check
if [ -z "$1" ]; then
  echo "Usage: $0 <start_directory>"
  echo "Example: $0 ./input_images"
  exit 1
fi

START_DIR="$1"
PROCESSED_DIR="processed"

# 2. Dependency Checks
if ! command -v curl &> /dev/null; then
    echo "Error: 'curl' is not installed."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed."
    exit 1
fi

# Create output directory
if [ ! -d "$PROCESSED_DIR" ]; then
    mkdir -p "$PROCESSED_DIR"
    echo "Created output directory: $PROCESSED_DIR"
fi

# Define Variations
VAR1='{"type_of_shot":"clean, minimalist, product-focused", "focus_area":"the main item of the attached image in sharp detail"}'
VAR2='{"type_of_shot":"professional studio, crisp, well-lit", "focus_area":"the main item of the attached image with clean slightly vignette studio background"}'
VAR3='{"type_of_shot":"editorial, refined, elegant", "focus_area":"the main item of the attached image as the hero element"}'

# Function to handle individual variation processing
process_variation() {
    local img_path="$1"
    local var_num="$2"
    local var_json="$3"
    
    local filename=$(basename -- "$img_path")
    local filename_no_ext="${filename%.*}"
    local output_file="${PROCESSED_DIR}/${filename_no_ext}_var${var_num}.jpeg"

    echo "  [Variation $var_num] Submitting job..."

    # 3. Job Submission
    # Note: Assuming the API returns a JSON object with an 'id' field.
    response=$(curl -s -X POST http://localhost:3000/jobs \
      -H "Content-Type: multipart/form-data" \
      -F "image=@$img_path" \
      -F "promptId=enhance_image" \
      -F "expectedOutcome=image" \
      -F "variables=$var_json")

    # 4. Job Tracking
    jobId=$(echo "$response" | jq -r '.jobId')

    if [ "$jobId" == "null" ] || [ -z "$jobId" ]; then
        echo "    Error: Failed to get Job ID. API Response: $response"
        return
    fi

    echo "    Job ID: $jobId. Polling for status..."

    # Poll until completed or failed
    while true; do
        job_status_res=$(curl -s "http://localhost:3000/jobs/$jobId")
        status=$(echo "$job_status_res" | jq -r '.status')

        if [ "$status" == "completed" ]; then
            echo "    Status: completed. Downloading image..."
            
            # Download Result
            http_code=$(curl -s -w "%{http_code}" -o "$output_file" "http://localhost:3000/jobs/$jobId/image")
            
            if [ "$http_code" == "200" ]; then
                echo "    Saved to: $output_file"
            else
                echo "    Error downloading image. HTTP Code: $http_code"
            fi
            break
        elif [ "$status" == "failed" ]; then
            echo "    Status: failed. Skipping download."
            break
        else
            # Wait a bit before next poll
            # echo "    Status: $status..."
            sleep 2
        fi
    done
    echo "***************************************************"
    echo "THIS IS LARGERLY UNTESTED" 
    echo "***************************************************"

}

echo "Starting bulk processing in: $START_DIR"

# Check if directory exists
if [ ! -d "$START_DIR" ]; then
    echo "Error: Directory '$START_DIR' not found."
    exit 1
fi

# Iterate through images
# Using find to safely handle spaces in filenames and multiple extensions case-insensitively
find "$START_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) -print0 | while IFS= read -r -d '' img; do
    echo "------------------------------------------------"
    echo "Processing File: $img"
    
    process_variation "$img" 1 "$VAR1"
    process_variation "$img" 2 "$VAR2"
    process_variation "$img" 3 "$VAR3"

done

echo "------------------------------------------------"
echo "Batch processing complete."
