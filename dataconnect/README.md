# Firebase Data Connect

This folder contains the Data Connect service definition, schema, and connectors.

## Structure

- `dataconnect.yaml`: service configuration (serviceId, location, schema source, connectors)
- `schema/schema.gql`: main Data Connect schema (tables/views)
- `connector/todo/connector.yaml`: connector id for Todo operations
- `connector/todo/todo.gql`: CRUD operations for Todo

## Deploy

Run from repository root:

```bash
firebase deploy --only dataconnect --force
```

`--force` avoids interactive prompts in terminal/CI when Firebase reports insecure operation warnings.

## Note

The project uses root `firebase.json` as the only Firebase CLI config source.
