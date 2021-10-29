## Step 1: Adding the Create Order endpoint

For this Step 1, you will add the Create Order endpoint. Upon receiving a webhook request from a delivery service, you will generate an ID for the order and insert it into the database.

To do this, you need to complete the following tasks:

- Provision a DynamoDB table;
- Configure a Lambda function with an HTTP event for the endpoint;
- Write the function code for the endpoint; and
- Deploy & invoke your service.

We'll work through these in order.

### Provision a DynamoDB table.

First, you must provision a DynamoDB table. Your `template.yml` file can provision any CloudFormation resources by adding them to the `Resources` block.

Review the [`AWS::DynamoDB::Table CloudFormation resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-dynamodb-table.html) documentation to see the required properties and format for provisioning a table in CloudFormation.

At the bottom on your `template.yml`, add the following `Resources` block:

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
```

This provisions a DynamoDB table with a primary key of `orderId`.

### Configure your Lambda function + HTTP endpoint

Next, we need to create the Lambda function and API Gateway endpoint to handle our webhook and write to DynamoDB.

To configure a function, you add a resource of type `AWS::Serverless::Function` to your `template.yml`.

Update your `template.yml` so that the `Resources:` block includes a `CreateOrderFunction` resource as follows:

```yml
Resources:
  OrdersTable: ...
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
            Path: /orders
            Method: POST
```

This creates a single function. It has a handler that will be located at `src/createOrder.js` (to be created), with an exported `handler` function that serves as the entry point for your Lambda function.

Because our Lambda function will be writing an Order record to our DynamoDB table, we must give it the proper IAM permissions to do so. In the `Policies` section, notice that we grant the `dynamodb:PutItem` permission to the Lambda function. It uses the `GetAtt` intrinsic function to retrieve the ARN of the DynamoDB table created in the table.

Notice that we didn't give our DynamoDB table a name when we created it. You may give it a name, but it is common to let CloudFormation name it to avoid conflicts within your account. However, our Lambda function needs to know the name of the table to access it.

To handle this, we pass the name of the table as a `TABLE_NAME` environment variable using the `Environment` property on our Function resource. We use the `Ref` intrinsic function in CloudFormation to fetch the table name.

Next, we need to configure an event source for our function. In the `Events` section, we set up an event of type `Api`. This uses API Gateway to set up an HTTP endpoint for our function. We configure a path of `/orders` and a method of `POST` for our endpoint.

Finally, add the following `Outputs:` section to the end of your `template.yml`:

```yml
Outputs:
  WebEndpoint:
    Description: "API Gateway endpoint URL for Prod stage"
    Value: !Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/"
```

This will print out the URL for your API Gateway that will make it easier to test your deployed endpoint.

Now that we have configured our infrastructure for the CreateOrders endpoint, let's create our function code.

### Writing the function code

The code for our CreateOrder endpoint is pretty simple -- it must handle a webhook request, create an `orderId`, and save it to our DynamoDB table.

Create a file at `src/createOrder.js` with the following code:

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

This code includes an exported `handler` function that is our Lambda function entry point. It has `event` and `context` arguments that include information about the specific event that triggered our Lambda function as well as meta information about our function, respectively.

In the code, we create an `orderId`, then save it to DynamoDB using the `put()` operation. Finally, we return a response in the format expected by API Gateway, which includes a `statusCode` property and a `body` property for the HTTP response.

### Deploying your service & invoking your endpoint

Now that the function code and infrastructure code is ready, it is time to deploy the serverless application.

Run the following command in your terminal to deploy:

```bash
sam deploy --guided
```

By using the `--guided` prompt, it will ask you a set of configuration options for your first deploy.

After setting up your configuration, SAM will deploy your service, which will create your Lambda function, API Gateway infrastructure, and DynamoDB table.

At the end, SAM will print the outputs from your deployed CloudFormation stack. It should look as follows:

```bash
CloudFormation outputs from deployed stack
-------------------------------------------------------------------------------------------------
Outputs
-------------------------------------------------------------------------------------------------
Key                 WebEndpoint
Description         API Gateway endpoint URL for Prod stage
Value               https://<apiId>.execute-api.us-east-1.amazonaws.com/Prod/
-------------------------------------------------------------------------------------------------
```

Run the following command with your POST endpoint to send a sample webhook and test your function:

```bash
curl -X POST <yourEndpoint>/orders
```

Be sure to replace `<yourEndpoint>` with your actual endpoint from the service information.

You should see a result like the following:

```bash
{"orderId":"772afa52699d3ff64645"}
```

Success! You created an Order. Move on to [Step 2](./../2-get-order) to see how to read your Order back.
