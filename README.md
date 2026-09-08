<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
## Description

**Task Tracer** — a task tracking REST API built with [NestJS](https://github.com/nestjs/nest), documented with
OpenAPI/Swagger and covered by Jest unit and e2e tests.

Tasks are persisted in PostgreSQL via [`TasksRepository`](src/tasks/tasks.repository.ts) (TypeORM under the
hood). The service depends only on that class's methods, so the backing store can be swapped again by
reimplementing it — unit tests do exactly that, running against an in-memory fake
([`InMemoryTasksRepository`](src/tasks/testing/in-memory-tasks.repository.ts)) instead of a real database.

## Project setup

```bash
pnpm install
```

Create a `.env` file and point it at a PostgreSQL 18 instance:

| Variable      | Default                  | Description                                                              |
| ------------- | ------------------------ | ------------------------------------------------------------------------ |
| `DB_HOST`     | `localhost`              | Postgres host                                                            |
| `DB_PORT`     | `5432`                   | Postgres port                                                            |
| `DB_USERNAME` | `postgres`               | Postgres user                                                            |
| `DB_PASSWORD` | —                        | Postgres password                                                        |
| `DB_DATABASE` | `task_tracer_backend_db` | Database name — create it beforehand (`createdb task_tracer_backend_db`) |

The `tasks` table (and its enum types) are created automatically on boot via TypeORM's `synchronize` option —
no migration step needed for local development.

Redis backs the list-endpoint cache (see [Caching](#caching)). It is optional — the API runs without it, just
without the cache:

| Variable         | Default     | Description                                      |
| ---------------- | ----------- | ------------------------------------------------ |
| `REDIS_HOST`     | `localhost` | Redis host                                       |
| `REDIS_PORT`     | `6379`      | Redis port                                       |
| `REDIS_PASSWORD` | —           | Redis password; omit when the server allows none |
| `REDIS_DB`       | `0`         | Redis logical database index                     |

## Compile and run the project

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run build && npm run start:prod
```

The API listens on `http://localhost:3000` by default; set `PORT` to change it.

## Docker

With `.env` in place (`DB_PASSWORD` must be set), bring up the API, PostgreSQL and Redis together:

```bash
docker compose up --build
```

Compose waits for the Postgres and Redis healthchecks before booting the API, which then creates the schema
via TypeORM's `synchronize`. Data lives in the `postgres-data` volume and survives `docker compose down`
(add `-v` to wipe it). Redis is cache-only: persistence is disabled and it runs under a 256 MB `allkeys-lru`
bound, so losing it costs nothing but a few cold reads.

The API container reads `.env` directly, but overrides `DB_HOST`/`DB_PORT` and `REDIS_HOST`/`REDIS_PORT` to
reach Postgres and Redis over the compose network — so those values in `.env` only apply when running outside
Docker. Set `API_PORT`, `DB_PORT_HOST` or `REDIS_PORT_HOST` in `.env` if 3000, 5432 or 6379 are already taken
on your machine.

Running the API on the host while keeping its dependencies in containers:

```bash
docker compose up -d postgres redis
pnpm start:dev
```

```bash
docker compose logs -f api      # follow the API logs
docker compose exec postgres psql -U postgres task_tracer_backend_db
docker compose exec redis redis-cli KEYS 'tasks:*'   # inspect cached pages
docker compose down             # stop; add -v to also drop the database volume
```

To run just the image against a database you already have:

```bash
docker build -t task-tracer-backend .
docker run --rm -p 3000:3000 --env-file .env task-tracer-backend
```

The build is multi-stage: dependencies and `tsc` run in builder stages, and the final image carries only
`dist/`, production dependencies and `package.json`, running as the unprivileged `node` user.

## Caching

`GET /tasks` is cached in Redis for 60 seconds. Cold reads hit Postgres and filter, sort and paginate in the
service; warm reads are served straight from Redis.

Filters, sorting and pagination all change the response, so all of them are part of the cache key. That means
one set of rows fans out across as many keys as there are query combinations clients ask for:

```
tasks:list:v4:limit=5&page=1&sortBy=createdAt&sortOrder=desc
tasks:list:v4:limit=5&page=1&sortBy=createdAt&sortOrder=desc&status=TODO
tasks:list:v4:limit=10&page=1&sortBy=title&sortOrder=asc
```

### Invalidating it

A single `POST /tasks` can change every one of those pages, and the key space is unbounded, so a write cannot
enumerate the keys it would have to delete. Sweeping them is no better: `KEYS` blocks the server, and `SCAN`
races against concurrent writers.

Instead the keys are namespaced by a generation counter, `tasks:list-version`. Every write — create, update,
delete — does one `INCR`. Readers build their key from the current counter, so the entire previous generation
becomes unreachable in a single atomic operation and is reclaimed by its own TTL. Invalidation is O(1) and
costs one round trip regardless of how many pages are cached.

The tradeoff is that retired pages linger in memory until their TTL expires rather than being freed on the
write. The 60 second TTL and the `allkeys-lru` bound on the Redis container keep that bounded.

The counter deliberately sits outside the `tasks:list:` prefix that pages use, so a prefix scan over cached
pages can never pick up the counter itself.

### When Redis is down

The cache is an optimisation, never a correctness or availability dependency. Every `CacheService` method
fails open: a Redis outage is logged as a warning and the request is served from Postgres. Because a reader
that cannot read the counter cannot know which generation an entry belongs to, it skips the cache entirely
rather than risk serving another generation's page. Writes still succeed; the cache simply repopulates once
Redis is reachable again.

The one gap worth naming: if a write commits and its `INCR` then fails, cached pages stay stale until their
TTL expires. Bounding that is what the TTL is for — the cache is never the source of truth.

### Telling clients which source answered

A cached page and a freshly computed one are identical in the body, so `GET /tasks` reports the decision in
response headers instead of leaving clients to infer it:

| Header                 | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| `X-Cache`              | `HIT`, `MISS`, or `BYPASS` when Redis could not be reached         |
| `X-Cache-Key`          | the key the page was read from or written to; absent on a bypass   |
| `X-Cache-Age`          | seconds since the returned page was computed (`0` on a miss)       |
| `X-Cache-Invalidation` | `enabled`, or `disabled` when writes are not retiring cached pages |

The age is why cached pages are stored wrapped in `{ cachedAt, page }` rather than as a bare page: a Redis TTL
answers "how much longer", not "since when", and the age is the number that makes a stale read visible.
Entries written by a build that predates the envelope are rejected by `isCachedListPage` and treated as a
miss, so a deploy cannot serve a page with no rows.

`enableCors` names all four in `exposedHeaders`. Browsers hide every non-safelisted response header from
scripts otherwise, so a direct (non-proxied) client could not read them.

### Breaking invalidation on purpose

`TASKS_CACHE_BREAK_INVALIDATION=true` stops writes from bumping the generation counter. It exists to
reproduce the stale-read bug the counter prevents, and it logs a warning at startup. Never enable it in
production.

`TasksService.clear()` bumps unconditionally even with the switch on. It is fixture setup, and a test
inheriting the previous test's cached rows would fail for reasons unrelated to what it asserts.

To watch the list go stale:

```bash
# 1. turn the switch on and restart
TASKS_CACHE_BREAK_INVALIDATION=true docker compose up -d api

# 2. warm the cache -- the second read is a HIT
curl -sD - -o /dev/null 'http://localhost:3000/tasks?limit=5'
curl -sD - -o /dev/null 'http://localhost:3000/tasks?limit=5'

# 3. create a task
curl -s -XPOST http://localhost:3000/tasks -H 'Content-Type: application/json' \
  -d '{"title":"you will not see me"}'

# 4. read again: still a HIT on the same key, and the new task is missing
curl -s 'http://localhost:3000/tasks?limit=5'

# 5. but the row is really there -- stats are not cached
curl -s http://localhost:3000/tasks/stats
```

What you should see at step 4: `X-Cache: HIT`, the same `X-Cache-Key` as step 2, an unchanged
`tasks:list-version`, and a `meta.total` that does not count the task you just created. The list recovers on
its own once the 60 second TTL expires, which is the bound on how wrong it can get. Turn the switch back off
and repeat: step 4 becomes a `MISS` on a `v`-incremented key and the new task appears immediately.

## API documentation

With the app running:

| What         | URL                                 |
| ------------ | ----------------------------------- |
| Swagger UI   | http://localhost:3000/api/docs      |
| OpenAPI JSON | http://localhost:3000/api/docs-json |

### Endpoints

| Method   | Path           | Description                                                                |
| -------- | -------------- | -------------------------------------------------------------------------- |
| `POST`   | `/tasks`       | Create a task                                                              |
| `GET`    | `/tasks`       | List tasks — filtered, sorted, paginated (cached, see [Caching](#caching)) |
| `GET`    | `/tasks/stats` | Counts by status and priority, overdue count, completion rate              |
| `GET`    | `/tasks/:id`   | Fetch one task                                                             |
| `PATCH`  | `/tasks/:id`   | Update the fields present in the body                                      |
| `DELETE` | `/tasks/:id`   | Delete a task (`204`)                                                      |
| `GET`    | `/health`      | Liveness probe                                                             |

### The task model

`status` is one of `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE` (default `TODO`); `priority` is one of `LOW`,
`MEDIUM`, `HIGH`, `URGENT` (default `MEDIUM`). Only `title` is required on create. Tags are lowercased and
de-duplicated. Moving a task to `DONE` stamps `completedAt`; moving it back out clears it again.

### List query parameters

All optional: `status`, `priority`, `assignee`, `tag`, `search` (title and description, case-insensitive),
`overdue` (`true` keeps only past-due unfinished tasks), `page` (default `1`), `limit` (default `20`, max `100`),
`sortBy` (`createdAt` | `updatedAt` | `dueDate` | `priority` | `title`), `sortOrder` (`asc` | `desc`).
Responses carry `items` plus `meta` with `total`, `page`, `limit`, `totalPages`, `hasNextPage`, `hasPreviousPage`.

Unknown body or query properties are rejected with `400` by the global `ValidationPipe`.

### Try it

```bash
curl -X POST http://localhost:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Ship the tracer API","priority":"HIGH","tags":["api"],"dueDate":"2026-09-30T17:00:00.000Z"}'
```

```bash
curl "http://localhost:3000/tasks?status=TODO&sortBy=priority&sortOrder=desc&limit=10"
```

## Run tests

```bash
# unit tests
npm run test OR pnpm test

# e2e tests (real HTTP through the same pipeline as production; needs the
# Postgres database from `.env` reachable — they read and write real rows)
npm run test:e2e OR pnpm test:e2e

# test coverage
npm run test:cov OR pnpm test:cov
```

Nest 12 ships as ESM, so the test scripts run Jest through
`node --experimental-vm-modules` — that flag is what lets Jest `require` those ESM packages.

The e2e specs build the app with [`configureApp`](src/bootstrap.ts), the same helper `main.ts` uses, so the
validation pipe and CORS under test match what runs in production.

## Deployment

```bash
npm run build
npm run start:prod
```

`build` runs `tsc -p tsconfig.build.json` straight to `dist/`; `start:prod` runs `node dist/main`. The server
binds to `PORT` when it is set and falls back to 3000 — see [`resolvePort`](src/bootstrap.ts), which the
OpenAPI `servers` entry reads too, so the documented URL always matches the port in use.

See the [Nest deployment documentation](https://docs.nestjs.com/deployment) for production guidance.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

# task-tracer-backend
