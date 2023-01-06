## Serverless Lab -- Authenticated Orders Service

In this lab, you will be building a serverless orders service using AWS SAM. This service will receive webhooks from a delivery service, such as DoorDash or GrubHub, that indicate orders to be placed. You will store the orders in a database and provide an endpoint to check the status of a given order.

To do this, you will create two HTTP endpoints:

- **Create Order** (`POST /orders`): An endpoint to receive webhooks from the delivery service.

- **Get Order** (`GET /orders/{orderId}`): An endpoint to check the status of a given order using the orderId.

You will use DynamoDB to store the Order information.

Finally, you want to include authorization on the Create Order endpoint to ensure that the requests are valid orders from the delivery service. The delivery service has given you a static token that will be included in every Create Order request.

### Getting started

Before walking through the steps below, create a new directory for your application.

In that directory, create a barebones `template.yml` file with the following contents:

```yml
AWSTemplateFormatVersion: 2010-09-09
Description: >-
  sam-auth

Transform:
  - AWS::Serverless-2016-10-31
```

### Steps:

This lab is comprised of five steps. Each step has instructions in a sub-directory, as well as the final code for that step.

The steps are:

1. [Add the CreateOrder endpoint](./01-create-order)
2. [Add the GetOrder endpoint](./02-get-order)
3. [Add a simple authorization check](./03-authorization)
4. [Use Parameter Store to hold secrets](./04-parameter-store)
5. [Use a custom authorizer in API Gateway](./05-custom-authorizer)
