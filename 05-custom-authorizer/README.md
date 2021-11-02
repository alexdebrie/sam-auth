## Step 5: Using a custom authorizer in API Gateway

In our previous two steps, we added authorization logic in our Lambda function to ensure that the requesting client could access the endpoint. While that might work fine for a single function, it can be unwieldy boilerplate if we use it across many endpoints in our application.

To help with this, we can use a custom authorizer. A custom authorizer is a Lambda function that is invoked _before_ our endpoint handler. The custom authorizer handles auth logic only and determines whether the request can move on to the endpoint handler. If the request is unauthorized, it will return a `401 Unauthorized` response to the client.

In this step, we will use a custom authorizer to add authorization to both the Create Order and Get Order function. To do that, we will:

- Write our custom authorizer function;
- Remove authorization logic from our Create Order function
- Configure our authorizer in `template.yml`
- Deploy and test

Let's get started.

### Write our custom authorizer function

First, we need to write our custom authorizer.

A custom authorizer is a Lambda function, just like the others we have written. However, the `event` shape is slightly different.

When using the default `TOKEN` authorizer type, our event will look as follows:

```js
{
    "type":"TOKEN",
    "authorizationToken":"<tokenValue>",
    "methodArn":"arn:aws:execute-api:us-east-1:123456789012:ymy8tbxw7b/*/GET/"
}
```

The `authorizationToken` property will show the value of the authorization key for the authorizer. By default, it is the `Authorization` header of the request, though you can configure it. The `methodArn` is the ARN of the API Gateway method the request wants to access.

In crafting a response in your authorizer, you need to return the following:

```js
{
	"principalId": "my-username",
	"policyDocument": {
		"Version": "2012-10-17",
		"Statement": [
			{
				"Action": "execute-api:Invoke",
				"Effect": "Allow|Deny",
				"Resource": "arn:aws:execute-api:us-east-1:123456789012:qsxrty/test/GET/mydemoresource"
		]
	},
	"context": {
		"org": "my-org",
		"role": "admin",
		"createdAt": "2019-01-03T12:15:42"
	}
}
```

The `principalId` indicates the principal identifier for the caller.

The `policyDocument` is the important part. You need to return a valid IAM statement that either allows or denies access to the requested method.

Finally, you can include key-value properties in the `context` property to inject additional context into your Lambda function after the authorizer. This can be useful if you need to allow basic access to the function from your custom authorizer but need more fine-grained access within your function.

With this in mind, create a file called `src/authorizer.js` with the following contents:

```js
const AWS = require("aws-sdk");
const SSM = new AWS.SSM();

module.exports.handler = async (event, context) => {
  const parameterResponse = await SSM.getParameter({
    Name: "OrderToken",
  }).promise();
  const AUTH_TOKEN = parameterResponse.Parameter.Value;

  if (event.authorizationToken !== AUTH_TOKEN) {
    return {
      principalId: "vendor",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect: "Deny",
            Resource: "*",
          },
        ],
      },
    };
  }

  return {
    principalId: "vendor",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: event.methodArn,
        },
      ],
    },
  };
};
```

Notice that the basic logic is the same as from our Create Order function. We fetch our secret from SSM, then compared it to the `authorizationToken` value in our event object. If it fails, we return a `Deny` IAM statement. If it succeeds, we return an `Allow` statement.

Now that we've created our authorizer, let's clean up our Create Order function to remove the authorization code.

### Remove authorization code from Create Order

With authorization handled in the custom authorizer, we can remove it from our Create Order function.

Update the code in `src/createOrder.js` to look as follows:

```js
const crypto = require("crypto");
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event, context) => {
  const id = crypto.randomBytes(10).toString("hex");

  const response = await docClient
    .put({
      TableName: process.env.TABLE_NAME,
      Item: {
        orderId: id,
        orderTime: new Date().toISOString(),
      },
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({
      orderId: id,
    }),
  };
};
```

This is now back to where we were before adding authorization. This can clean up our function code and allow us to focus on our business logic in each endpoint.

### Update the configuration in `template.yml` to use the authorizer

Before deploying, we need to update our `template.yml` to register our custom authorizer as a function and configure it as an authorizer for our two endpoints.

Update the `Resources:` section of your `template.yml` to look as follows:

```yml
Resources:
  OrdersTable:
    Type: "AWS::DynamoDB::Table"
    Properties:
      AttributeDefinitions:
        - AttributeName: "orderId"
          AttributeType: "S"
      KeySchema:
        - AttributeName: "orderId"
          KeyType: "HASH"
      BillingMode: "PAY_PER_REQUEST"
  CreateOrderFunction:
    Type: "AWS::Serverless::Function"
    Properties:
      CodeUri: src/
      Handler: createOrder.handler
      Runtime: nodejs14.x
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - dynamodb:PutItem
              Resource: !GetAtt OrdersTable.Arn
      Environment:
        Variables:
          TABLE_NAME: !Ref OrdersTable
      Events:
        Api:
          Type: Api
          Properties:
            RestApiId: !Ref Api
            Path: /orders
            Method: POST
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
            RestApiId: !Ref Api
            Path: /orders/{orderId}
            Method: GET
  AuthorizerFunction:
    Type: "AWS::Serverless::Function"
    Properties:
      CodeUri: src/
      Handler: authorizer.handler
      Runtime: nodejs14.x
      Policies:
        - SSMParameterReadPolicy:
            ParameterName: OrderToken
  Api:
    Type: AWS::Serverless::Api
    Properties:
      StageName: Prod
      Auth:
        DefaultAuthorizer: Authorizer
        Authorizers:
          Authorizer:
            FunctionArn: !GetAtt AuthorizerFunction.Arn
```

There are four main changes here.

First, we added a third function, called `AuthorizerFunc`. We point this function configuration to its handler in `src/authorizer.handler`. Notice that this function has our `SSMParameterReadPolicy` because it will be reading our SSM Parameter to validate the `Authorization` header.

Notice that we don't have any events for this function. This function isn't invoked directly by API Gateway. Rather, it is used as part of the flow for other functions.

Second, we've created an `Api` resource of type `AWS::Serverless::Api`. This is our API Gateway instance. Previously, SAM would create an API Gateway instance implicitly when we created an API-enabled function. However, we need more control over the specifics of our API Gateway instance to configure the custom authorizer. Thus, we are creating our own instance.

Third, for both of our API Gateway-enabled functions, we set a property of `RestApiId: !Ref Api` for the API event. This indicates that it should use our custom API Gateway instance rather than the implicitly created instance.

Fourth, we remove the `SSMParameterReadPolicy` from our `CreateTable` function, as it is no longer reading from SSM.

Finally, update the `Outputs:` section of your `template.yml` to look as follows:

```yml
Outputs:
  WebEndpoint:
    Description: "API Gateway endpoint URL for Prod stage"
    Value: !Sub "https://${Api}.execute-api.${AWS::Region}.amazonaws.com/Prod/"
```

The implicit API Gateway instance has a resource name of `ServerlessRestApi`, but we gave our instance a name of `Api`. Thus, we need to change the output to read from the new resource.

### Deploy and invoke your functions

We are now ready to update our service.

Deploy your service with the following command:

```yml
sam deploy
```

Once your function is deployed, try creating a new Order. Notice that your API Gateway endpoint has changed. This is because we created a new API Gateway instance which has its own instance ID.

Run the following command in your terminal:

```bash
curl -X POST -H 'Authorization: token123' <yourEndpoint>
```

Be sure to replace `<yourEndpoint>` with your actual endpoint from the service information.

You should see a result indicating you created an order:

```bash
{"orderId":"ec31fd2967c12b0639be"}
```

If you try the same endpoint without the `Authorization` header, you will see the request will fail.

You can also test your Get Order endpoint, which is now protected with an authorizer.

Run the following command to retrieve an order:

```bash
curl -X GET <yourEndpoint>/<yourOrderId>
```

Be sure to replace `<yourEndpoint>` with your actual endpoint from the service information, and `<yourOrderId>` with an orderId that you received from a previous request.

Without the `Authorization` header, you should see an error indicating you are unauthorized:

```bash
{"message":"Unauthorized"}
```

If you try the command again with an `Authorization` header, you should be able to see your order:

```bash
{"order":{"orderTime":"2021-09-29T15:11:48.625Z","orderId":"a695ff768e544eeb072c"}}
```

If you want to read more about the intricacies of custom authorizers, check out my post on [custom authorizers with Lambda and API Gateway](https://www.alexdebrie.com/posts/lambda-custom-authorizers/).
