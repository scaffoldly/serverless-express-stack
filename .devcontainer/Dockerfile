FROM ghcr.io/scaffoldly/aws-localstack:3.1.0-node20

ENV SLY_DEBUG=1
RUN npm install -g @scaffoldly/awslambda-bootstrap@1.0.6

ENV PATH="/var/task/node_modules/.bin:${PATH}"
WORKDIR /var/task
COPY . .
