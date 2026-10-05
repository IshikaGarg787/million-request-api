# Million Requests API

A high-performance **Node.js + Express REST API** built to handle large request volumes using **Node.js Cluster, shared storage, rate limiting, pagination, and graceful shutdown**.

## Features

* RESTful User CRUD API
* Multi-process clustering using all CPU cores
* Shared in-memory data store across workers
* MongoDB support for persistent storage
* Rate limiting and request body protection
* Pagination for large datasets
* Automatic worker recovery
* Graceful shutdown
* Automated tests
* Built-in load testing with `autocannon`

## Tech Stack

* Node.js
* Express.js
* MongoDB / Mongoose
* Node.js Cluster
* JavaScript
* Autocannon

## API Endpoints

| Method | Endpoint         | Description                |
| ------ | ---------------- | -------------------------- |
| GET    | `/`              | API status                 |
| GET    | `/health`        | Health check               |
| GET    | `/api/users`     | List users with pagination |
| GET    | `/api/users/:id` | Get user                   |
| POST   | `/api/users`     | Create user                |
| PATCH  | `/api/users/:id` | Update user                |
| DELETE | `/api/users/:id` | Delete user                |

## Run Locally

```bash
npm install
npm run dev
```

For clustered execution:

```bash
npm start
```

## Testing

```bash
npm test
```

**19/19 tests passing**

## Benchmark

```bash
npm run benchmark
```

### Result

**1,400,000 requests — 0 failures**

| Test              |  Requests |       Throughput |
| ----------------- | --------: | ---------------: |
| GET `/`           | 1,000,000 | **16,427 req/s** |
| GET `/api/users`  |   200,000 |  **5,548 req/s** |
| POST `/api/users` |   200,000 |  **5,123 req/s** |

Tested using **16 CPU cores and 15.4 GB RAM**.

## Architecture

```text
                    ┌──────────────┐
                    │   Primary    │
                    │    Process   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           Worker 1     Worker 2     Worker N
              │            │            │
              └────────────┼────────────┘
                           ▼
                    Shared Data Store
```

## Project Structure

```text
src/
├── cluster.js
├── server.js
├── startServer.js
├── app.js
├── controllers/
├── middleware/
├── models/
└── routes/

scripts/
└── benchmark.js

test/
```

## Key Performance Highlights

* **16,427 req/s** on `GET /`
* **1.4M requests** processed in benchmark
* **0 failed requests**
* **19/19 automated tests passing**
* Multi-core request processing with automatic worker recovery
