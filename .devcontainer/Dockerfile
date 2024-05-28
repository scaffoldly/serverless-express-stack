# FROM ghcr.io/scaffoldly/awslambda-nextjs:14
FROM ghcr.io/scaffoldly/aws-localstack:3.1.0-node20

COPY ./bootstrap /var/runtime/bootstrap
COPY ./handler.sh /var/task/handler.sh
COPY ./lambda-entrypoint.sh /lambda-entrypoint.sh

RUN curl -Lo /usr/local/bin/aws-lambda-rie https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie && \
    chmod +x /usr/local/bin/aws-lambda-rie

ENTRYPOINT ["/lambda-entrypoint.sh"]
