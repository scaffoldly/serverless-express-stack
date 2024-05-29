FROM ghcr.io/scaffoldly/aws-localstack:3.1.0-node20

RUN npm install -g next@14
ENTRYPOINT ["/bin/lambda-entrypoint.sh"]

COPY ./handler.sh /var/task/handler

RUN npm install -g @scaffoldly/awslambda-bootstrap@1.0.1
