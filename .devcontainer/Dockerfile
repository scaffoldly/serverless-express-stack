FROM ghcr.io/scaffoldly/aws-localstack:3.1.0-node20

ENV SLY_DEBUG=1

WORKDIR /var/task
COPY . .

ENTRYPOINT ["/lambda-entrypoint.sh"]