# Twenty end-to-end (E2E) Testing

## Prerequisite

Installing the browsers:

```
npx nx setup twenty-e2e-testing
```

### Run end-to-end tests

```
npx nx test twenty-e2e-testing
```

### Start isolated authenticated browser UAT

From the repository root, run the same command for fresh and repeat launches:

```sh
UAT_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/uat_disposable \
UAT_REDIS_URL=redis://127.0.0.1:6379/5 \
  npx nx start:isolated-uat twenty-e2e-testing
```

The launcher uses one host/port configuration for API and frontend URLs, resets and seeds the disposable database through the canonical server target, waits for application-level readiness, and cleans up only the processes recorded in `.tmp/isolated-uat.json`.

### Start the interactive UI mode

```
npx nx test:ui twenty-e2e-testing
```

### Run test in specific file
```
npx nx test twenty-e2e-testing <filename>
```

Example (location of the test must be specified from the root of `twenty-e2e-testing` package):
```
npx nx test twenty-e2e-testing tests/login.spec.ts
```

### Runs the tests in debug mode.
```
npx nx test:debug twenty-e2e-testing
```

### Show report after tests
```
npx nx test:report twenty-e2e-testing
```

## Q&A

#### Why there's `path.resolve()` everywhere?
That's thanks to differences in root directory when running tests using commands and using IDE. When running tests with commands, 
the root directory is `twenty/packages/twenty-e2e-testing`, for IDE it depends on how someone sets the configuration. This way, it
ensures that no matter which IDE or OS Shell is used, the result will be the same.
