FROM ghcr.io/scaffoldly/aws-localstack:3.1.0-node20-df07846bbbc56434c895ae7f09ee8507cba9eb93

ENV SLY_DEBUG=1

WORKDIR /var/task
COPY . .

RUN npm install -g prettier

ENTRYPOINT ["/lambda-entrypoint.sh"]
