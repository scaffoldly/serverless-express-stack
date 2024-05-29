FROM ghcr.io/scaffoldly/aws-localstack:3.1.0-node20

RUN npm install -g next@14
ENTRYPOINT ["/bin/lambda-entrypoint.sh"]

COPY ./handler.sh /var/task/handler

RUN npm install -g @scaffoldly/awslambda-bootstrap@git+https://github.com/scaffoldly/awslambda-bootstrap.git#1a76b5d0e017e5061c8bef6c1ef7d342e08c94b6
