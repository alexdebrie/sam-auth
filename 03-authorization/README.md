## Step 3: Adding authorization and handling errors

In the previous steps, we added HTTP endpoints to handle creating an order and viewing an order. In doing so, we saw how to return a response from our Lambda function that matches what API Gateway expects.

In our application, we want to add some sort of authorization. We only want our delivery partner to create orders in our application, rather than anyone that discovers our endpoint.

To do so, we'll add some very simple authorization logic. Our delivery partner gave us a static token that will be included in every request as the `Authorization` header. When handling a Create Order request, we will check the value of that header against the proper value. If it does not match, we will return a `401 Unauthorized` response.

To do this, we need to perform the following steps:

- Update our function code to handle authorization and errors
- Deploy and invoke our function

Let's get started.

### Update Create Order to handle authorization

Because our delivery partner is giving us the same static token with every request, we might be tempted to include it directly in our function code. Let's do that here, and we'll update it in later steps.

Update your `src/createOrder.js` function to include the following code:

```js
const crypto = require("crypto");
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

const AUTH_TOKEN = "token123";

module.exports.handler = async (event, context) => {
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

A few things to note here. First, notice that we just include our token (`token123`) directly in our function code as the `AUTH_TOKEN` variable. While this may seem easy, it does mean that we commit our secret token to our git repo. This is something we shouldn't do and will fix in the next step.

Second, notice how we're checking the authorization. First, we extract the `Authorization` header from `event.headers`. Then, we compare that value to the hard-coded `AUTH_TOKEN`. If the header is missing or if the values don't match, we do not retrieve the order.

Notice that we must include an API Gateway-friendly response even on errors. If we don't, API Gateway won't know how to handle the response and thus will return a `500 Internal Service Error` response. This can make it hard to monitor our application as we will be combining known, expected errors, such as `401`, `403`, or `404`, with unexpected internal errors like `500`.

Thus, just like we return a successful `200` response in the shape API Gateway wants, we return an Unauthorized `401` response in the same shape:

```js
if (!Authorization || Authorization !== AUTH_TOKEN) {
  return {
    statusCode: 401,
    body: JSON.stringify({
      message: "Unauthorized.",
    }),
  };
}
```

### Deploying our function and testing our auth

To make this live, we need to redeploy our service.

Run the following command to redeploy:

```bash
sam deploy
```

After it deploys, try invoking your Create Order endpoint as before:

```bash
curl -X POST <yourEndpoint>
```

Be sure to replace `<yourEndpoint>` with your actual endpoint from the service information.

Without any `Authorization` header included, you should see a result like the following:

```bash
{"message":"Unauthorized."}
```

It also includes a `401` status code that makes it easy for clients to interpret.

Let's try invoking with the proper Authorization.

Run the following command in your terminal:

```bash
curl -X POST -H 'Authorization: token123' <yourEndpoint>
```

Be sure to replace `<yourEndpoint>` with your actual endpoint from the service information.

Notice that we've included an `Authorization` header with our static token's value. You should see a result indicating you created an order:

```bash
{"orderId":"84ccd402f23c08a2dd8a"}
```

Success! We added some simple authorization. However, we don't like that our token value is hard-coded into our function and committed to our repo. Let's change in [Step 4](./../04-parameter-store) by using Parameter Store to store our secret.
