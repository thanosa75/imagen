# API Summary

This document provides a brief summary of the available API endpoints for the Gemini Image Processing API.

## Endpoints

### 1. List Prompts
- **Method**: `GET`
- **Path**: `/prompts/show`
- **Description**: Retrieves a list of all available prompt templates and their configurations.

### 2. Submit Job
- **Method**: `POST`
- **Path**: `/jobs`
- **Description**: Submits a new image processing or generation job.
- **Notes**: Accepts `multipart/form-data`. The `image` file is optional when requesting text-to-image generation (using `expectedOutcome="image"`).

### 3. Get Job Status
- **Method**: `GET`
- **Path**: `/jobs/:id`
- **Description**: Retrieves the current status, metadata, and text results of a specific job.

### 4. Get Job Image
- **Method**: `GET`
- **Path**: `/jobs/:id/image`
- **Description**: Downloads the binary image result for a completed job (applicable when `expectedOutcome="image"`).
