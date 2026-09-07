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
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

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

With `.env` in place (`DB_PASSWORD` must be set), bring up the API and PostgreSQL together:

```bash
docker compose up --build
```

Compose waits for Postgres' healthcheck before booting the API, which then creates the schema via TypeORM's
`synchronize`. Data lives in the `postgres-data` volume and survives `docker compose down` (add `-v` to wipe it).

The API container reads `.env` directly, but overrides `DB_HOST`/`DB_PORT` to reach Postgres over the compose
network — so those two values in `.env` only apply when running outside Docker. Set `API_PORT` or
`DB_PORT_HOST` in `.env` if 3000 or 5432 are already taken on your machine.

```bash
docker compose logs -f api      # follow the API logs
docker compose exec postgres psql -U postgres task_tracer_backend_db
docker compose down             # stop; add -v to also drop the database volume
```

To run just the image against a database you already have:

```bash
docker build -t task-tracer-backend .
docker run --rm -p 3000:3000 --env-file .env task-tracer-backend
```

The build is multi-stage: dependencies and `tsc` run in builder stages, and the final image carries only
`dist/`, production dependencies and `package.json`, running as the unprivileged `node` user.

## API documentation

With the app running:

| What         | URL                                 |
| ------------ | ----------------------------------- |
| Swagger UI   | http://localhost:3000/api/docs      |
| OpenAPI JSON | http://localhost:3000/api/docs-json |
| OpenAPI YAML | http://localhost:3000/api/docs-yaml |

### Endpoints

| Method   | Path           | Description                                                   |
| -------- | -------------- | ------------------------------------------------------------- |
| `POST`   | `/tasks`       | Create a task                                                 |
| `GET`    | `/tasks`       | List tasks — filtered, sorted, paginated                      |
| `GET`    | `/tasks/stats` | Counts by status and priority, overdue count, completion rate |
| `GET`    | `/tasks/:id`   | Fetch one task                                                |
| `PATCH`  | `/tasks/:id`   | Update the fields present in the body                         |
| `DELETE` | `/tasks/:id`   | Delete a task (`204`)                                         |
| `GET`    | `/health`      | Liveness probe                                                |

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
