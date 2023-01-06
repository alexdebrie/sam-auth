## Step 4: Handling secrets with Parameter Store

In the previous step, we added some simple authorization logic to our Create Order function. However, it relied on a hard-coded token in our function code. This has two downsides. First, it commits the token to our application git repo. Second, updating the token requires a deploy of our serverless application.

Let's fix that in this step. We will use [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html), often referred to as just "Parameter Store", to hold our secrets. Parameter Store provides a simple, free, key-value parameter repository to hold application secrets, resource values, or other bits of configuration.

To do this, we will:

- Store our token as a parameter in Parameter Store
- Update our function code to read from Parameter Store on each request
- Add the relevant IAM permissions in `serverless.yml`
- Deploy and test our logic

Let's get started.

### Store our token as a parameter in Parameter Store.

First, let's store our parameter in Parameter Store. We will do this in the AWS console, though you could use the AWS CLI as well.

Navigate to the [Parameter Store page in the AWS console](https://console.aws.amazon.com/systems-manager/parameters). Click the **Create parameter** button to begin the parameter creation wizard.

Give your parameter a name of `OrderToken`. You may give it a description if you want.

You can choose a Standard or Advanced parameter tier. The Standard tier is free and works for our needs, but the Advanced tier allows you to have more parameters as well as larger parameters and parameter policies.

There are three types of parameters -- String, StringList, or SecureString. SecureString is encrypted with AWS KMS so it cannot be read if someone gets access to only Parameter. StringList allows you to save an array of values in a single parameter. Because this is an application secret, let's use the `SecureString` option. The value of the parameter will be encrypted with a KMS key and will require decryption to read.

Finally, enter the `value` for your parameter, which is the same value as your hard-coded token. Then, click **Create parameter** to create your parameter.

![SSM Parameter Store](https://user-images.githubusercontent.com/6509926/139457864-af5bb0ad-c438-47b2-a384-0e02c4039e63.png)

Now that we have saved our parameter, let's use it in our Lambda function code.

### Accessing Parameter Store from our Lambda function code

Next, we need to update our function code. We will remove the hard-coded token value and replace it with a call to Parameter Store.

Update `src/createOrder.js` to have the following contents:

```js
const crypto = require("crypto");
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const SSM = new AWS.SSM();

module.exports.handler = async (event, context) => {
  const parameterResponse = await SSM.getParameter({
    Name: "OrderToken",
    WithDecryption: true,
  }).promise();
  const AUTH_TOKEN = parameterResponse.Parameter.Value;

  const { Authorization } = event.headers;

  if (!Authorization || Authorization !== AUTH_TOKEN) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: "Unauthorized.",
      }),
    };
  }

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

In the body of our handler function, we make a `GetParameter` call to Parameter Store (via the `SSM` service namespace). This retrieves the parameter value, which we can compare to the `Authorization` header from our request.

Notice that none of the rest of the code changed. The only thing that is different is where we got the secret value from. Rather than being in our function code, we retrieve it with a network call to Parameter Store.

### Add IAM permissions in `template.yml`

Whenever we make a new AWS service call in our Lambda function, we usually need to update IAM permissions in our `template.yml`.

In this case, we are calling the `GetParameter` method from the `SSM` service. Finally, we are doing it on a particular Parameter value.

Previously, we've used the `Policies` property on our Function resources to add IAM statements directly. Now, let's see how to use preconfigured [SAM policy templates](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-templates.html) to grant permissions.

In your `template.yml`, update the `Policices` block of your `CreateOrderFunction` so it looks as follows:

```yml
Resources:
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
        - SSMParameterReadPolicy:
            ParameterName: OrderToken
```

We have kept our original statement to allow `dynamodb:PutItem` access. We've also added an `SSMParameterReadPolicy` which allows us to read the `OrderToken` value.

SAM policy templates are a great way to get limited, reusable bits of IAM permissions for your Lambda functions. Be sure to review the [SAM policy template documentation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-templates.html) for more.

To learn more about Parameter Store IAM configuration, please see the [AWS documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-access.html).

### Deploy your service and invoke your function

Now that we have added a parameter, changed our code, and updated our IAM configuration, we can redeploy and test our application.

Run the following command in your terminal to deploy your service:

```bash
sam deploy
```

Then, invoke the function with your `Authorization` header:

Run the following command in your terminal:

```bash
curl -X POST -H 'Authorization: token123' <yourEndpoint>
```

Be sure to replace `<yourEndpoint>` with your actual endpoint from the service information.

You should see a result indicating you created an order:

```bash
{"orderId":"ec31fd2967c12b0639be"}
```

Success! You used Parameter Store to securely store your token to be retrieved on each request.

Notice that, as configured, this will be slower than the original method. There is a network request to Parameter Store on _each_ request.

If the token does not change often, you could "cache" the parameter value within a particular Lambda function instance. That might look as following:

```js
const crypto = require("crypto");
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const SSM = new AWS.SSM();

let AUTH_TOKEN = null;

module.exports.handler = async (event, context) => {
  if (!AUTH_TOKEN) {
    const parameterResponse = await SSM.getParameter({
      Name: "OrderToken",
    }).promise();
    AUTH_TOKEN = parameterResponse.Parameter.Value;
  }
```

Notice that we set `AUTH_TOKEN` to null in our global scope. When invoking our function, we see if `AUTH_TOKEN` has a value. If not, we fetch from Parameter Store and set the `AUTH_TOKEN` variable to the returned value. On subsequent requests, the global `AUTH_TOKEN` variable will contain our value and will not require a subsequent call to Parameter Store.

That concludes Step 4, where we saw how to manage true secrets in our serverless application. However, we still have auth logic mixed in with our function handler. If many functions use the same auth logic, this could be repetitive boilerplate. In [Step 5](./../05-custom-authorizer), we will see how to abstract auth logic into a separate function.
