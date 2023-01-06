## Step 2: Adding a Get Order endpoint

In the previous step, you added a Lambda function and API Gateway endpoint to handle a webhook from a delivery service and create an order in the database.

In this step, you will see how to read your order back from the database. To do this, you will complete the following tasks:

- Configure a new function + event in `template.yml`
- Write a function to read from DynamoDB and return the result.

Let's get started.

### Configure a Get Order function + event in `template.yml`

In this step, we want to create an endpoint to fetch and return an Order by its orderId. To do this, we will use a _path parameter_ in API Gateway to extract the orderId.

Let's start by configuring our function and endpoint. In your `serverless.yml`, update your `Resources:` section to include a new `GetOrderFunction` resource:

```yml
Resources:
  OrdersTable: ...
  CreateOrderFunction: ...
  GetOrderFunction:
    Type: "AWS::Serverless::Function"
    Properties:
      CodeUri: src/
      Handler: getOrder.handler
      Runtime: nodejs14.x
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - dynamodb:GetItem
              Resource: !GetAtt OrdersTable.Arn
      Environment:
        Variables:
          TABLE_NAME: !Ref OrdersTable
      Events:
        Api:
          Type: Api
          Properties:
            Path: /orders/{orderId}
            Method: GET
```

We keep the `CreateOrderFunction` from before, and we add a `GetOrderFunction` as well.

Notice that this function has a different handler -- `getOrder.handler`. We will use a different file in our application to handle this function.

Additionally, look at the `Api` event configuration for this function. It has the same `Path` and `Method` properties. Notice that the path is `/orders/{orderId}`. The value in curly brackets -- `{orderId}` -- is a path parameter. API Gateway will pattern-match on that URL path to send it to the function. Thus, making a GET request to `/orders/252646dfd64a406e68de` or to `/orders/79fa925041cd0558787d` will both go to the Get Order function, without us having to state the exact route in advance.

Finally, notice that we configure IAM permissions in the `Policices` section again. This time, we added `"dynamodb:GetItem"` as an `Action` in our IAM statement. This will allow us to read from our DynamoDB table.

### Writing a function to retrieve an Order

Next, we need to write the function code to retrieve an Order.

Create a file called `src/getOrder.js` with the following contents:

```js
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event, context) => {
  const { orderId } = event.pathParameters;

  const response = await docClient
    .get({
      TableName: process.env.TABLE_NAME,
      Key: { orderId: orderId },
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({
      order: response.Item,
    }),
  };
};
```

We have the same handler format for our Lambda function. Notice that we can extract the `orderId` path parameter from the `event.pathParameter` object. We then use that value to read the item from DynamoDB and return it to the user.

### Deploying and invoking to retrieve an Order

Finally, we need to deploy our service to update our application in the cloud.

Run the following command in your terminal:

```bash
sam deploy
```

You don't need to use the `--guided` flag this time. The configuration has been saved in your `samconfig.toml` configuration file and will be reused.

This will deploy your function. After it deploys, you should be able to retrieve an order with the following command:

```bash
curl -X GET <yourEndpoint>/orders/<orderId>
```

Be sure to replace `<yourEndpoint>` with your endpoint, and replace `<orderId>` with an orderId that was returned from your Create Order function.

Success! You read your Order back. Move on to [Step 3](./../03-authorization) to see how to handle errors in your Lambda functions that are connected to API Gateway.
