# Lunch-broker

## `GET /menu`

Fetches menu for current week as `json`.

## `GET /menu?weekNumber=<weekNumber>`

Fetches menu for the given week as `json`.

## `POST /menu`

Uploads and parses files into menu. `Content-Type` must be `multipart/form-data` for uploading the files

**Currently only "Boost Food Lunsjmeny powerpoint" is supported.**
