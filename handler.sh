function hello () {
  echo "!!! hello from hello function" >&2
  echo "!!! env:\n$(env)" >&2
  echo "!!! event:\n$1" >&2

  RESPONSE="{\"body\": \"{\\\"message\\\": \\\"Hello Provided!\\\"}\", \"statusCode\": 200}"

  echo $RESPONSE
}
