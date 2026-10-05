# Million Requests API

A Node.js + Express API designed to take a very large amount of traffic. It is a
users CRUD API (create / read / update / delete) wrapped in everything that makes an
API survive heavy load: multi-process clustering, a data store shared by all
workers, rate limiting, pagination, graceful shutdown, a load-testing tool, and a
Docker setup for spreading traffic across several servers.

This project merges the work of the three team folders (Person1, Person2, Person3)
into one finished, working project - see [Where each person's work went](#where-each-persons-work-went).

---

## 1. Quick start (5 minutes)

You need **Node.js 20.19 or newer** (check with `node --version`). Download it from
https://nodejs.org if needed.

```powershell
# 1. open a terminal in this folder, then install the packages (once)
npm install

# 2. start the API using ALL your CPU cores
npm start
```

You should see something like:

```
Primary process 1234 starting 8 worker(s) (storage: memory)
Worker 5678 listening on port 3000 (storage: memory)
...
```

Open http://localhost:3000 in your browser. You should see
`{"message":"API is ready to handle high traffic", ...}`.

Press **Ctrl + C** to stop it. It finishes the requests it is working on first.

> No database is needed for this default mode. Users are kept in memory, so they
> disappear when you stop the server. To keep them, use [MongoDB mode](#6-saving-data-with-mongodb).

Other commands:

| Command | What it does |
|---|---|
| `npm start` | Production mode: one worker per CPU core |
| `npm run dev` | One single process (simplest for learning/debugging) |
| `npm test` | Runs the 19 automated tests |
| `npm run benchmark` | Load test: sends **1,000,000 requests** and prints the results |

---

## 2. Using the API

| Method | URL | What it does |
|---|---|---|
| GET | `/` | Welcome message |
| GET | `/health` | Health check (used by load balancers) |
| POST | `/api/users` | Create a user: body `{"name": "...", "email": "..."}` |
| GET | `/api/users?page=1&limit=20` | List users, one page at a time (max 100 per page) |
| GET | `/api/users/:id` | Get one user |
| PATCH | `/api/users/:id` | Change `name` and/or `email` |
| DELETE | `/api/users/:id` | Delete a user |

Try it in **PowerShell**:

```powershell
# create a user
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/users `
  -ContentType "application/json" `
  -Body '{"name":"Asha","email":"asha@example.com"}'

# list users
Invoke-RestMethod http://localhost:3000/api/users

# get user 1
Invoke-RestMethod http://localhost:3000/api/users/1

# rename user 1
Invoke-RestMethod -Method Patch -Uri http://localhost:3000/api/users/1 `
  -ContentType "application/json" -Body '{"name":"Asha Kumari"}'

# delete user 1
Invoke-RestMethod -Method Delete -Uri http://localhost:3000/api/users/1
```

Or with **curl** (Mac / Linux / Git Bash):

```bash
curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" \
     -d '{"name":"Asha","email":"asha@example.com"}'
curl "http://localhost:3000/api/users?limit=5"
```

Status codes: `201` created, `200` OK, `204` deleted, `400` bad input,
`404` not found, `409` email already used, `413` body too big, `429` too many
requests, `503` data store unavailable.

The list response looks like:

```json
{ "data": [ { "id": 1, "name": "Asha", "email": "asha@example.com" } ],
  "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
```

Every response includes an `X-Worker-Pid` header showing which worker process
answered, so you can *see* the load being spread out.

---

## 3. How it handles a huge number of requests

A single Node.js process uses only **one** CPU core. These are the techniques used here
to get much more out of the same computer (and beyond it):

| Technique | Where | Why it helps |
|---|---|---|
| **Clustering** | `src/cluster.js` | Starts one worker process per CPU core, so all cores serve requests. A crashed worker is replaced automatically. |
| **Shared data store** | `src/models/memoryUserStore.js` | Workers are separate processes with separate memory. Without sharing, a user created on worker 1 would be "not found" on worker 2. The primary process owns the data and the workers ask it. (`test/cluster.test.js` proves this.) |
| **MongoDB mode** | `src/models/mongoUserStore.js` | A real database shared by every worker *and every server*, with a unique index on email. |
| **Pagination** | `src/controllers/userController.js` | The list endpoint can never return "all million users" in one response (max 100). |
| **Fast lookups** | `src/models/localMemoryStore.js` | Users are stored in Maps, so finding a user or checking an email is instant, even with a million users (the original used `array.find`, which gets slower with every user). |
| **Rate limiting** | `src/middleware/rateLimiter.js` | One client (or attacker) cannot use up all the capacity: `429 Too Many Requests`. |
| **Body size limit** | `src/app.js` | Huge request bodies are rejected (`413`). |
| **Lean middleware** | `src/app.js` | No ETag hashing, no per-request logging by default, tiny headers: less CPU per request. |
| **Connection tuning** | `src/startServer.js` | A big connection queue (`backlog: 4096`) for sudden bursts, and keep-alive timeouts that work with load balancers. |
| **Graceful shutdown** | `src/startServer.js`, `src/cluster.js` | On Ctrl+C / deploy, running requests finish before the process exits - nobody gets a dropped request. |
| **Health check** | `GET /health` | Lets load balancers and Docker detect a sick server and stop sending it traffic. |
| **Crash-loop guard** | `src/cluster.js` | If workers keep crashing (e.g. MongoDB is down) it stops instead of restarting forever. |
| **Horizontal scaling** | `docker-compose.yml`, `nginx.conf` | nginx spreads traffic over several API containers (each one a cluster). |

---

## 4. Load test: "a million requests"

```powershell
npm run benchmark            # 1,000,000 requests (takes a few minutes)
npm run benchmark -- --quick # 100,000 requests (about a minute)
```

It starts its own copy of the API, sends the requests with
[autocannon](https://github.com/mcollina/autocannon), then prints requests per second,
latency, and how many requests failed. Three tests run: reading `/`, reading a user
list, and creating users.

You can also test a server that is already running:
`npm run benchmark -- --url http://localhost:3000` (turn rate limiting off for the test
with `RATE_LIMIT_MAX=0`, otherwise the limiter will - correctly - start refusing requests).

### Measured results

I ran `npm run benchmark` while building this project, on a very small machine:
**1 CPU core, 4 GB RAM, with the load generator and the API sharing that one core**
(200 simultaneous connections):

| Test | Requests | Speed | Avg latency | Failed |
|---|---|---|---|---|
| `GET /` | 1,000,000 | ~6,700 requests/second | 29 ms | 0 |
| `GET /api/users?limit=20` | 200,000 | ~5,000 requests/second | 39 ms | 0 |
| `POST /api/users` (new users) | 200,000 | ~4,400 requests/second | 44 ms | 0 |

That is **1,400,000 requests with zero failures**; the first million took about 2.5 minutes.
Your own computer very likely has more cores, so run the benchmark yourself and
use your numbers - each extra core adds another worker, but how much faster *your* machine
is will depend on its hardware (I could only measure the 1-core case).


### An honest note about "millions of requests *at a time*"

* **One million requests in total** is easy for this API on an ordinary computer: it
  finishes in minutes (see the results above).
* **Millions of requests in the *same second*** is more than any single computer can
  do. Large companies reach that scale by running many servers behind a load
  balancer. That is exactly what `docker-compose.yml` + `nginx.conf` set up, and you add
  capacity by adding containers/servers. The code is built so that this works: the API
  processes keep no private state (data is in MongoDB), so any server can answer any
  request.

---

## 5. Settings

Everything is configured with environment variables, or a `.env` file
(copy `.env.example` to `.env`):

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `WORKERS` | number of CPU cores | Worker processes |
| `STORAGE` | `memory` | `memory` or `mongo` |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/million_requests_api` | MongoDB address |
| `MONGO_POOL_SIZE` | `20` | Database connections *per worker* |
| `RATE_LIMIT_MAX` | `1000` | Requests per IP per window (`0` = off) |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Length of the window |
| `BODY_LIMIT` | `10kb` | Largest request body |
| `LOG_REQUESTS` | `false` | Print a line per request (slows things down) |
| `TRUST_PROXY` | off | Set `1` behind nginx so the real client IP is used |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | How long to wait for running requests when stopping |

---

## 6. Saving data with MongoDB

1. Install MongoDB Community (https://www.mongodb.com/try/download/community), or create a
   free cloud database on MongoDB Atlas and copy its connection string.
2. Create a `.env` file (copy `.env.example`) and set:
   ```
   STORAGE=mongo
   MONGO_URI=mongodb://127.0.0.1:27017/million_requests_api
   ```
3. `npm start`

Now users survive restarts and are shared by all workers. If MongoDB cannot be reached the
workers print an error, and after repeated failures the primary stops instead of looping forever.

---

## 7. Scaling across several servers (Docker)

Requires Docker Desktop. This is optional.

```powershell
docker compose up --build
```

This starts **MongoDB**, **3 API containers** (each a cluster of 2 workers) and **nginx**
as a load balancer. Use http://localhost:8080 instead of port 3000. Run
`docker compose up --build --scale api=6` for more containers. Check
`X-Worker-Pid` in the responses to see different workers answering.

---

## 8. Project layout

```
src/
  cluster.js            <- npm start: primary + workers
  server.js             <- npm run dev: a single process
  startServer.js        <- starts one web server (shared by both)
  app.js                <- the Express app and its middleware
  config.js             <- all settings
  routes/userRoutes.js
  controllers/userController.js   <- validation + request handling
  middleware/rateLimiter.js, errorHandler.js
  models/
    userModel.js            <- chooses memory or mongo
    memoryUserStore.js      <- shared in-memory store (cluster-safe)
    localMemoryStore.js     <- the data structure behind it
    mongoUserStore.js       <- MongoDB version
scripts/benchmark.js        <- the 1,000,000 request load test
test/                       <- automated tests
Dockerfile, docker-compose.yml, nginx.conf
```

## Where each person's work went

* **Person 1** - Express server, user routes/controller/model: kept and extended (validation,
  pagination, update endpoint, Map-based fast model).
* **Person 2** - cluster scaling with worker restart: kept, then added graceful shutdown, a
  crash-loop guard and the shared store. (The duplicated `app.use("/api/users", ...)` line in
  `server.js` was removed.)
* **Person 3** - MongoDB/mongoose and dotenv: they were installed but never used. They are
  now a working `STORAGE=mongo` mode and a real `.env` configuration.

## Known limits (good next steps)

* In `memory` mode all data lives in the primary process: it is lost on restart, and it
  only works on one machine. Use `STORAGE=mongo` for real use or several servers.
* Rate-limit counters are per worker, so the effective limit is roughly `RATE_LIMIT_MAX` x
  number of workers. A shared counter (Redis) would make it exact.
* There is no login/authentication yet - add it before putting this on the public internet.
* MongoDB mode and the Docker files are included but were not run in the environment where
  this project was built (no MongoDB or Docker available there); the memory mode, cluster,
  tests and benchmark were run.
