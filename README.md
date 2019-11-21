# Lunch-broker

## `GET /menu`

Fetches menu for current week as `json`.

</br>

## `GET /menu/<weekNumber>`

Fetches menu for the given week as `json`. For example `GET /menu/week/47` will return menu for week 47.

</br>

## `POST /menu`

Uploads and parses files into menu. `Content-Type` must be `multipart/form-data` for uploading the files

**Currently only "Boost Food Lunsjmeny powerpoint" is supported.**
