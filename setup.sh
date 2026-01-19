#!/bin/bash

# Gemini Image Processing API Setup Script

echo "Starting setup..."

# 1. Check for .env file, create from .env.example if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
else
    echo ".env file already exists."
fi

# 2. Check for GEMINI_API_KEY in .env
if grep -q "your_gemini_api_key_here" .env; then
    echo "WARNING: GEMINI_API_KEY is not set in .env."
    echo "Please edit the .env file and add your Gemini API key."
fi

# 3. Create necessary directories for uploads and results
echo "Creating data directories..."
mkdir -p uploads results
touch uploads/.gitkeep
touch results/.gitkeep

echo ""
echo "Setup complete!"
echo ""
echo "To start the application, run:"
echo "docker-compose up --build"
echo ""
echo "The API will be available at http://localhost:3000"
