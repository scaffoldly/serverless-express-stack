function hello () {
  echo "!!! hello from hello function"
  env

  RESPONSE="{\"body\": \"{\\\"message\\\": \\\"Hello Provided!\\\"}\", \"statusCode\": 200}"

  echo $RESPONSE
}
