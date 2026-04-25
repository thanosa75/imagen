# Gemini Image Processing API

A production-ready REST API for processing images using Google's Gemini AI model. This service provides asynchronous job processing with Redis-backed queuing, supporting various image analysis tasks like OCR, object detection, scene understanding, and more.

## 🌟 Features

- **Asynchronous Processing**: Submit jobs and retrieve results when ready
- **Multiple Analysis Types**: Pre-configured prompts for different image analysis and generation tasks
- **Image Generation**: Generate images from text descriptions using state-of-the-art models
- **Flexible Templating**: Customizable prompts with variable substitution
- **Redis Queue**: Reliable job queuing and status tracking
- **Docker Support**: Easy deployment with Docker Compose
- **Production Ready**: Comprehensive error handling, logging, and graceful shutdown

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Interactive Documentation](#interactive-documentation)
  - [API Endpoints](#api-endpoints)
  - [Available Prompts](#available-prompts)
- [Examples](#examples)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## 🔧 Prerequisites

- **Docker** and **Docker Compose** (recommended)
- **Node.js** 20+ (for local development)
- **Redis** 7+ (included in Docker setup)
- **Google Gemini API Key** ([Get one here](https://makersuite.google.com/app/apikey))

## 📦 Installation

### Using Docker (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd imagen
   ```

2. **Run the setup script**:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Configure your API key**:
   Edit the `.env` file and add your Gemini API key:
   ```bash
   GEMINI_API_KEY=your_actual_api_key_here
   ```

4. **Start the services**:
   ```bash
   docker-compose up --build
   ```

The API will be available at `http://localhost:3000`

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

3. **Start Redis** (if not using Docker):
   ```bash
   redis-server
   ```

4. **Start the API server**:
   ```bash
   npm start
   ```

5. **Start the worker** (in a separate terminal):
   ```bash
   node src/workers/jobWorker.js
   ```

## ⚙️ Configuration

### Environment Variables

Configure the application by editing the `.env` file:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-pro
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# Job Processing Configuration
MAX_CONCURRENT_JOBS=5
JOB_TIMEOUT_MS=300000
JOB_TTL=86400

# File Upload Configuration
MAX_FILE_SIZE_MB=10
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp,image/gif

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🚀 Usage

### Interactive Documentation

The API documentation is available in interactive Swagger UI format at:

`http://localhost:3000/doc`

This interface allows you to explore endpoints, view schemas, and test API calls directly from your browser.

### API Endpoints

#### 1. List Available Prompts

**GET** `/prompts/show`

Retrieve a list of all available prompt templates.

**Response** (200 OK):
```json
{
  "prompts": [
    {
      "id": "describe_image",
      "name": "Image Description",
      "description": "Provides a detailed description of an image.",
      "requiredVariables": [],
      "supportedOutcomes": ["text"]
    },
    ...
  ]
}
```

#### 2. Submit a Job

**POST** `/jobs`

Submit an image for processing with a specific prompt.

**Request**:
- Content-Type: `multipart/form-data`
- Body:
  - `image` (file, required): Image file (JPEG, PNG, WEBP)
  - `promptId` (string, required): ID of the prompt to use
  - `expectedOutcome` (string, required): Either `"text"` or `"image"`
  - `variables` (JSON object, optional): Variables for prompt template

**Response** (201 Created):
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2026-01-17T12:00:00.000Z"
}
```

#### 2. Get Job Status

**GET** `/jobs/:id`

Retrieve the status and results of a job.

**Response** (200 OK):

*Pending/Processing:*
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "promptId": "describe_image",
  "expectedOutcome": "text",
  "createdAt": "2026-01-17T12:00:00.000Z",
  "updatedAt": "2026-01-17T12:00:05.000Z",
  "completedAt": null
}
```

*Completed:*
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "promptId": "describe_image",
  "expectedOutcome": "text",
  "createdAt": "2026-01-17T12:00:00.000Z",
  "updatedAt": "2026-01-17T12:00:15.000Z",
  "completedAt": "2026-01-17T12:00:15.000Z",
  "result": {
    "text": "A detailed description of the image..."
  },
  "metadata": {
    "processingTime": 8500,
    "promptUsed": "Analyze this image and provide a detailed description...",
    "modelVersion": "gemini-1.5-pro"
  }
}
```

*Failed:*
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "promptId": "describe_image",
  "expectedOutcome": "text",
  "createdAt": "2026-01-17T12:00:00.000Z",
  "updatedAt": "2026-01-17T12:00:10.000Z",
  "completedAt": "2026-01-17T12:00:10.000Z",
  "error": {
    "message": "API rate limit exceeded",
    "code": "RATE_LIMIT_ERROR"
  }
}
```

#### 3. Get Image Result

**GET** `/jobs/:id/image`

Download the processed image (for jobs with `expectedOutcome: "image"`).

**Response** (200 OK):
- Content-Type: `image/jpeg` (or appropriate image MIME type)
- Body: Binary image data

**Note**: Currently, Gemini 1.5 Pro returns text descriptions rather than generated images. This endpoint is prepared for future image generation capabilities.

### Available Prompts

The API includes 8 pre-configured prompts in [`data/prompts.json`](data/prompts.json):

#### 1. **describe_image**
Provides a detailed description of an image.

**Variables**:
- `detail_level` (optional, default: "detailed"): Level of detail
- `focus_area` (optional, default: "all visual elements, composition, colors, and subjects"): What to focus on

**Example**:
```json
{
  "variables": {
    "detail_level": "brief",
    "focus_area": "the main subject only"
  }
}
```

#### 2. **ocr**
Extracts all visible text from an image.

**Variables**:
- `format` (optional, default: "plain text"): Output format
- `layout` (optional, default: "original layout and structure"): How to preserve layout

**Example**:
```json
{
  "variables": {
    "format": "JSON with text and coordinates",
    "layout": "line-by-line structure"
  }
}
```

#### 3. **extract_colors**
Identifies and extracts dominant colors from an image.

**Variables**:
- `count` (optional, default: "5"): Number of colors to extract
- `format` (optional, default: "hex color codes with color names"): Color format
- `additional_info` (optional, default: "the approximate percentage of each color in the image"): Extra information

**Example**:
```json
{
  "variables": {
    "count": "3",
    "format": "RGB values",
    "additional_info": "color mood and palette description"
  }
}
```

#### 4. **object_detection**
Detects and identifies objects in an image.

**Variables**:
- `object_type` (optional, default: "objects and items"): Type of objects to detect
- `details` (optional, default: "the name, approximate location, and size"): Details to include
- `confidence_instruction` (optional, default: "Include your confidence level for each detection."): Confidence handling

**Example**:
```json
{
  "variables": {
    "object_type": "people and faces",
    "details": "count, positions, and any visible attributes",
    "confidence_instruction": "Only include detections with high confidence."
  }
}
```

#### 5. **image_classification**
Classifies an image into categories.

**Variables**:
- `aspects` (optional, default: "subject matter, style, mood, and context"): Classification aspects
- `output_format` (optional, default: "a list of categories with confidence scores"): Output format

**Example**:
```json
{
  "variables": {
    "aspects": "artistic style and genre only",
    "output_format": "the top 3 most relevant categories"
  }
}
```

#### 6. **scene_understanding**
Provides comprehensive understanding of a scene.

**Variables**:
- `elements` (optional, default: "the setting, objects, people, activities, and atmosphere"): Scene elements
- `context` (optional, default: "the likely context, time of day, location type, and any notable details"): Context information

**Example**:
```json
{
  "variables": {
    "elements": "the environment and weather conditions",
    "context": "outdoor/indoor setting and time of day"
  }
}
```

#### 7. **compare_images**
Compares and analyzes similarities and differences between images.

**Variables**:
- `comparison_aspects` (optional, default: "visual similarities, differences, composition, and style"): What to compare
- `output_focus` (optional, default: "key differences and notable similarities"): Output focus

**Example**:
```json
{
  "variables": {
    "comparison_aspects": "color palette and lighting only",
    "output_focus": "technical differences in photography"
  }
}
```

#### 8. **accessibility_description**
Creates detailed alt-text descriptions for accessibility.

**Variables**:
- `elements` (optional, default: "all important visual information, text, and context"): Elements to include
- `style` (optional, default: "clear, concise, and descriptive"): Description style
- `max_length` (optional, default: "250 words"): Maximum length

**Example**:
```json
{
  "variables": {
    "elements": "essential information only",
    "style": "brief and factual",
    "max_length": "100 words"
  }
}
```

## 📝 Examples

### Example 1: List Available Prompts

```bash
curl http://localhost:3000/prompts/show
```

### Example 2: Basic Image Description

```bash
curl -X POST http://localhost:3000/jobs \
  -F "image=@/path/to/photo.jpg" \
  -F "promptId=describe_image" \
  -F "expectedOutcome=text"
```

**Response**:
```json
{
  "jobId": "abc123-def456-ghi789",
  "status": "pending",
  "createdAt": "2026-01-17T12:00:00.000Z"
}
```

### Example 2: OCR with Custom Variables

```bash
curl -X POST http://localhost:3000/jobs \
  -F "image=@/path/to/document.png" \
  -F "promptId=ocr" \
  -F "expectedOutcome=text" \
  -F 'variables={"format":"JSON with text and coordinates","layout":"line-by-line structure"}'
```

### Example 3: Check Job Status

```bash
curl http://localhost:3000/jobs/abc123-def456-ghi789
```

**Response**:
```json
{
  "jobId": "abc123-def456-ghi789",
  "status": "completed",
  "promptId": "describe_image",
  "expectedOutcome": "text",
  "createdAt": "2026-01-17T12:00:00.000Z",
  "updatedAt": "2026-01-17T12:00:15.000Z",
  "completedAt": "2026-01-17T12:00:15.000Z",
  "result": {
    "text": "The image shows a sunset over a calm ocean with vibrant orange and pink hues in the sky..."
  },
  "metadata": {
    "processingTime": 8500,
    "promptUsed": "Analyze this image and provide a detailed description. Focus on all visual elements, composition, colors, and subjects.",
    "modelVersion": "gemini-1.5-pro"
  }
}
```

### Example 4: Color Extraction

```bash
curl -X POST http://localhost:3000/jobs \
  -F "image=@/path/to/artwork.jpg" \
  -F "promptId=extract_colors" \
  -F "expectedOutcome=text" \
  -F 'variables={"count":"3","format":"hex color codes with color names"}'
```

### Example 5: Object Detection

```bash
curl -X POST http://localhost:3000/jobs \
  -F "image=@/path/to/street_scene.jpg" \
  -F "promptId=object_detection" \
  -F "expectedOutcome=text" \
  -F 'variables={"object_type":"vehicles and pedestrians","details":"count and approximate positions"}'
```

### Example 6: Accessibility Description

```bash
curl -X POST http://localhost:3000/jobs \
  -F "image=@/path/to/infographic.png" \
  -F "promptId=accessibility_description" \
  -F "expectedOutcome=text" \
  -F 'variables={"max_length":"150 words","style":"clear and concise"}'
```

### Example 7: Text-to-Image Generation

Generate an image from a text description. Note that the `image` file input is optional for this mode.

```bash
curl -X POST http://localhost:3000/jobs \
  -F "promptId=generate_image" \
  -F "expectedOutcome=image" \
  -F 'variables={"prompt":"generate a cyberpunk city"}'
```

**Note**: This feature uses the configured image generation model (default: `gemini-2.5-flash-image`).

## 🏗️ Architecture

### System Components

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────────────────────────────┐
│         Express API Server          │
│  ┌──────────────────────────────┐  │
│  │   Controllers & Routes       │  │
│  │   - Job Submission           │  │
│  │   - Status Retrieval         │  │
│  └──────────────────────────────┘  │
└──────────┬──────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │    Redis     │
    │  - Job Queue │
    │  - Job Data  │
    └──────┬───────┘
           │
           ▼
┌──────────────────────────────────────┐
│         Job Worker Process           │
│  ┌──────────────────────────────┐   │
│  │  1. Dequeue Job              │   │
│  │  2. Load Prompt Template     │   │
│  │  3. Process with Gemini API  │   │
│  │  4. Store Results            │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

### Directory Structure

```
imagen/
├── data/
│   ├── prompts.json          # Prompt templates
│   ├── uploads/              # Uploaded images
│   └── results/              # Generated results
├── src/
│   ├── config/
│   │   ├── redis.js          # Redis connection
│   │   └── logger.js         # Logging configuration
│   ├── controllers/
│   │   └── jobController.js  # Request handlers
│   ├── middleware/
│   │   ├── errorHandler.js   # Error handling
│   │   └── validator.js      # Input validation
│   ├── repositories/
│   │   └── jobRepository.js  # Job data access
│   ├── routes/
│   │   └── jobRoutes.js      # API routes
│   ├── services/
│   │   ├── geminiService.js  # Gemini API integration
│   │   ├── promptService.js  # Prompt management
│   │   └── queueService.js   # Queue operations
│   ├── utils/
│   │   └── logger.js         # Logging utilities
│   ├── workers/
│   │   └── jobWorker.js      # Background job processor
│   ├── app.js                # Express app setup
│   └── server.js             # Server entry point
├── docker-compose.yml        # Docker services
├── Dockerfile                # Container definition
├── package.json              # Dependencies
├── setup.sh                  # Setup script
└── .env.example              # Environment template
```

### Job Lifecycle

1. **Submission**: Client uploads image via POST `/jobs`
2. **Validation**: Request validated, image stored
3. **Queuing**: Job added to Redis queue
4. **Processing**: Worker picks up job, calls Gemini API
5. **Completion**: Results stored in Redis
6. **Retrieval**: Client polls GET `/jobs/:id` for results

## 🔍 Troubleshooting

### Common Issues

#### 1. "GEMINI_API_KEY is not set"

**Problem**: The Gemini API key is missing or invalid.

**Solution**:
```bash
# Edit .env file
nano .env

# Add your API key
GEMINI_API_KEY=your_actual_api_key_here

# Restart services
docker-compose restart
```

#### 2. "Connection refused" to Redis

**Problem**: Redis is not running or not accessible.

**Solution**:
```bash
# Check if Redis container is running
docker-compose ps

# Restart Redis
docker-compose restart redis

# Check Redis logs
docker-compose logs redis
```

#### 3. Jobs stuck in "pending" status

**Problem**: Worker is not running or crashed.

**Solution**:
```bash
# Check worker logs
docker-compose logs worker

# Restart worker
docker-compose restart worker

# Check for errors in logs
docker-compose logs -f worker
```

#### 4. "File too large" error

**Problem**: Image exceeds maximum file size.

**Solution**:
```bash
# Edit .env to increase limit
MAX_FILE_SIZE_MB=20

# Restart API
docker-compose restart api
```

#### 5. "Invalid file type" error

**Problem**: Unsupported image format.

**Solution**: Ensure your image is in one of these formats:
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WEBP (.webp)
- GIF (.gif)

#### 6. Gemini API rate limit errors

**Problem**: Too many requests to Gemini API.

**Solution**:
- Wait a few minutes before retrying
- Reduce `MAX_CONCURRENT_JOBS` in `.env`
- Check your Gemini API quota

### Debugging

#### Enable Debug Logging

```bash
# Edit .env
LOG_LEVEL=debug

# Restart services
docker-compose restart
```

#### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f redis
```

#### Check Redis Data

```bash
# Connect to Redis CLI
docker-compose exec redis redis-cli

# List all jobs
KEYS job:*

# Get job details
HGETALL job:abc123-def456-ghi789

# Check queue length
LLEN queue:jobs
```

#### Health Check

```bash
# Check API health
curl http://localhost:3000/health

# Expected response
{"status":"ok","timestamp":"2026-01-17T12:00:00.000Z"}
```

## 🛠️ Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Coverage (Latest)

| Metric | Coverage | Delta (from baseline) |
|--------|----------|----------------------|
| Statements | 88.33% | +29.97% |
| Branches | 79.36% | +30.84% |
| Functions | 80.37% | +23.23% |
| Lines | 89.06% | +30.31% |

- **14 test suites** | **169 tests** all passing
- Unit tests: controllers, services, middleware, workers, Redis config, routes, validators
- Integration tests: end-to-end job flows (text/image outcomes, retries, failures, stream errors)

### Code Style

The project uses ESLint for code quality. Run linting with:

```bash
npm run lint
```

### Adding New Prompts

1. Edit [`data/prompts.json`](data/prompts.json)
2. Add your prompt following this structure:

```json
{
  "id": "your_prompt_id",
  "name": "Your Prompt Name",
  "description": "Description of what this prompt does",
  "template": "Your prompt template with {{variables}}",
  "supportedOutcomes": ["text"],
  "requiredVariables": [],
  "defaultVariables": {
    "variable_name": "default_value"
  },
  "examples": [
    {
      "variables": {
        "variable_name": "example_value"
      },
      "description": "Example description"
    }
  ]
}
```

3. Restart the services to load the new prompt

### Environment-Specific Configuration

**Development**:
```bash
NODE_ENV=development
LOG_LEVEL=debug
```

**Production**:
```bash
NODE_ENV=production
LOG_LEVEL=info
```

## 📄 License

ISC

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For issues and questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review [Gemini API documentation](https://ai.google.dev/docs)
- Open an issue in the repository

---

**Built with ❤️ using Google Gemini AI**
