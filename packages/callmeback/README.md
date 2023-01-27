# callmeback

Serverless-friendly background processing library. This library lets you enqueue HTTP requests to be processed in the background with adapters for:

- [Amazon SNS](https://docs.aws.amazon.com/sns/latest/dg/sns-http-https-endpoint-as-subscriber.html)
- [Google Cloud Tasks](https://cloud.google.com/tasks)
- [Zeplo](https://www.zeplo.io/)
- [QStash by Upstash](https://upstash.com/blog/qstash-announcement)
- In-process adapter (for local development and testing)

Due to differences in the way each service works, this library makes the following trade-off:

- The request method is always POST.
- The request body is always JSON-encoded. Some providers doesn’t allow setting request headers, so your endpoint should be configured to always decode JSON body, even if Content-Type is not `application/json`.
- Your service should be configured to send a 429 (Too Many Requests) when it is overloaded.
- The URL is fixed. On some services this must be preconfigured (e.g. [Amazon SNS](https://docs.aws.amazon.com/sns/latest/dg/SendMessageToHttp.subscribe.html)), while on other services it can be configured directly on the adapter (e.g. [Google Cloud Tasks](https://cloud.google.com/tasks/docs/creating-http-target-tasks)).
- Retry logic depends on the service. Amazon SNS has a [default retry policy](https://docs.aws.amazon.com/sns/latest/dg/SendMessageToHttp.retry.html) but [it can be configured](https://docs.aws.amazon.com/sns/latest/dg/sns-message-delivery-retries.html#creating-delivery-policy) on a topic or subscription. On Google Cloud Tasks, a [RetryConfig](https://cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues#RetryConfig) can be [configured](https://cloud.google.com/tasks/docs/configuring-queues#retry) on a queue.
- Rate limiting (throttling) depends on the service. Amazon SNS lets you [configure a throttle policy](https://docs.aws.amazon.com/sns/latest/dg/sns-message-delivery-retries.html#creating-delivery-policy) at the topic or subscription level. Google Cloud Tasks lets you [configure](https://cloud.google.com/tasks/docs/configuring-queues#retry) [RateLimits](https://cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues#ratelimits) on a queue.
- It is your service’s responsibility to verify the authenticity of incoming requests. An easy way is to embed some secret key when invoking `callMeBack()` and verify that the secret key is present on the way back. Or use some kind of signature or JWT.
- Due to retrying, your service may receive duplicate requests. It is your responsibility to make sure that your background job can be properly retried (e.g. by deduplicating requests or making sure actions are idempotent or conflict-free).

## Configuring queues and running tests

By default, the tests will only run against the in-process adapter.

To run the tests against other adapters, there are some preparation steps.

1. Expose the `requestbin` service so that it’s publicly available.

   - If you are developing in Codespaces, you can go to the **Ports** tab, right click on the server’s **Local Address** &rarr; **Port Visibility** &rarr; **Public**.
   - You can also use [ngrok](https://ngrok.com/) or [Cloudflare Quick Tunnel](https://blog.cloudflare.com/quick-tunnels-anytime-anywhere/) to expose the service.

   Then set the environment variable `REQUESTBIN_URL` to the URL of the `requestbin` service **without the trailing slash**, for example:

   ```sh
   export REQUESTBIN_URL=https://dtinth-verbose-computing-machine-rr4g7rgqv2jgj-35124.preview.app.github.dev
   ```

2. Set up the credentials for the other adapters.

   - Check out the below sections for more details.

## Usage with Amazon SNS

About [Amazon SNS](https://aws.amazon.com/sns/):

- You need to [pre-configure the URL](https://docs.aws.amazon.com/sns/latest/dg/SendMessageToHttp.subscribe.html) when creating the subscription.
- Once the subscription is created, you must [confirm the subscription](https://docs.aws.amazon.com/sns/latest/dg/SendMessageToHttp.confirm.html). Amazon SNS will send a request to the URL you configured. That request body will contain a `SubscribeURL` parameter. You must make a `GET` request to that URL to confirm the subscription. You can make your endpoint do that automatically, or you can take the URL and visit it manually in your browser.
- I am not sure whether SNS respects the `Retry-After` response header or not. If someone was able to test this, please let us know and update the documentation.
- Amazon SNS provides [metrics viewable in CloudWatch](https://docs.aws.amazon.com/sns/latest/dg/sns-monitoring-using-cloudwatch.html) out-of-the-box. However, [individual message delivery status logging must be configured and viewed in CloudWatch](https://docs.aws.amazon.com/sns/latest/dg/sns-topic-attributes.html). It lets you adjust the sampling rate to save costs.

Setting up:

1. Create a topic:

   ![image](https://user-images.githubusercontent.com/193136/215156534-ba1dde5e-c56b-44e3-86a3-9cf9803f4dfd.png)

2. Set it as a standard queue:

   ![image](https://user-images.githubusercontent.com/193136/215156736-eb55b980-3ee8-4ccc-8425-c3f481d5a0bf.png)

3. Take note of the topic ARN. Create a subscription.

   ![image](https://user-images.githubusercontent.com/193136/215157194-749b01a0-42e1-487f-bfed-c8153da0befa.png)

4. Make it an HTTPS subscription and set an endpoint.

   ![image](https://user-images.githubusercontent.com/193136/215157358-b9cbe0b7-c1f3-4357-933b-c845c51688b8.png)

5. Confirm the subscription by checking the `SubscribeURL`.

   ![image](https://user-images.githubusercontent.com/193136/215157870-96513204-7c3d-413a-93fd-79ba466bdb1d.png)

6. Grant permission to access the queue.

   ![image](https://user-images.githubusercontent.com/193136/215158078-fd3e982d-8bd3-4c3d-8572-0a715d28f8a3.png)

Creating an adapter:

```ts
import { SNS } from '@aws-sdk/client-sns'

const adapter = new AmazonSNSAdapter({
  topicArn: process.env.CALLMEBACK_SNS_TOPIC_ARN,
  sns: new SNS({}),
})
```

Expected environment variables:

```sh
CALLMEBACK_SNS_TOPIC_ARN=

# When providing credentials to the SDK via environment variables.
# Note that there may be better ways to provide credentials to the SDK
# depending on your environment and use case.
# See: https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-iam.html
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

Common errors:

- **Error: Region is missing**
  - May be fixed by setting the `AWS_REGION` environment variable.
- **CredentialsProviderError: Could not load credentials from any providers**
  - May be fixed by [providing the credentials to the SDK](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html).
- **AuthorizationErrorException: User: … is not authorized to perform: SNS:Publish on resource: … because no identity-based policy allows the SNS:Publish action**
  - May be fixed by granting the user permission to publish to the topic.
- **InvalidParameterException: Invalid parameter: TopicArn or TargetArn Reason: no value for required parameter**
  - May be fixed by correctly configuring the `topicArn` (i.e. the `CALLMEBACK_SNS_TOPIC_ARN` environment variable).
- **NotFoundException: Topic does not exist**
  - May be fixed by creating the topic (and making sure the topic ARN is correctly configured).

Monitor metrics in CloudWatch:

> ![image](https://user-images.githubusercontent.com/193136/215158684-4472e669-7943-46e4-863b-824f13465578.png)

Setting up logging:

> ![image](https://user-images.githubusercontent.com/193136/215158843-7e36a81f-3d04-41bb-b861-ae7851e11b37.png)

## Usage with Google Cloud Tasks

About [Google Cloud Tasks](https://cloud.google.com/tasks/):

- Allows the URL to be configured on a per-task basis.
- The URL does not need to be confirmed.
- [Respects the `Retry-After` response header, and retries with a higher backoff rate if 429 (Too Many Requests) or 503 (Service Unavailable) is returned.](https://cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues.tasks#httprequest)
- Provides a dashboard for viewing metrics and ongoing task statuses.
- [Logging can be turned on for individual tasks](https://cloud.google.com/tasks/docs/logging), but it is not enabled by default, as it may generate a large number of logs and can increase costs. Once enabled, it can be viewed in the [Cloud Logging](https://cloud.google.com/logging) dashboard. Note that this is an all-or-nothing setting (no sampling).

Setting up:

1. Create a task queue.

   ![image](https://user-images.githubusercontent.com/193136/215158976-80e7e21b-cec1-466f-8261-7a66fd89a94c.png)

2. Give it a name and region.

   ![image](https://user-images.githubusercontent.com/193136/215159131-9835f86c-1710-4544-8412-016d3aaf9ca4.png)

   Take note of the **name**, **region ID**, and **project ID** (found on the dashboard).

3. Construct a queue path using this format:

   ```
   projects/PROJECT_ID/locations/LOCATION_ID/queues/QUEUE_ID
   ```

4. Grant access to the queue:

   ![image](https://user-images.githubusercontent.com/193136/215159326-3ebb49fb-377b-4ee1-be7b-63401e22ec13.png)

Creating an adapter:

```ts
import { CloudTasksClient } from '@google-cloud/tasks'

const adapter = new GoogleCloudTasksAdapter({
  client: new CloudTasksClient(),
  queuePath: process.env.CALLMEBACK_CLOUD_TASK_QUEUE,
  url: 'https://.../',
})
```

Expected environment variables:

```sh
# PROJECT_ID is the ID of the Google Cloud project, found on the Google Cloud Console dashboard.
# LOCATION_ID is the ID of the location where the queue is located, e.g. "us-central1".
# QUEUE_ID is the ID of the queue, e.g. "callmeback".
CALLMEBACK_CLOUD_TASK_QUEUE=projects/PROJECT_ID/locations/LOCATION_ID/queues/QUEUE_ID

# When providing service account credentials to the SDK via environment variables.
# Note that there may be better ways to provide credentials to the SDK
# depending on your environment and use case.
# See: https://cloud.google.com/docs/authentication/provide-credentials-adc
GOOGLE_APPLICATION_CREDENTIALS=
```

Common errors:

- **Error: Could not load the default credentials.**
  - May be fixed by [providing the credentials to the SDK](https://cloud.google.com/docs/authentication/provide-credentials-adc).
- **Error: 3 INVALID_ARGUMENT: Invalid resource field value in the request.**
  - May be fixed by correctly configuring the `queuePath` (i.e. the `CALLMEBACK_CLOUD_TASK_QUEUE` environment variable) and making sure the `url` is valid.
- **Error: 7 PERMISSION_DENIED: The principal (user or service account) lacks IAM permission "cloudtasks.tasks.create" for the resource "projects/…/locations/…/queues/…" (or the resource may not exist).**
  - May be fixed by making sure the queue exists, the `queuePath` is correctly configured, permission to create tasks in the queue is granted to the user or service account (by using the “Cloud Tasks Enqueuer” role).

Monitor the metrics in Cloud Tasks dashboard:

> ![image](https://user-images.githubusercontent.com/193136/215159448-7934bfb5-7421-454a-a1c8-ad3de692a4ae.png)

Check the logs in Google Cloud Logging:

> ![image](https://user-images.githubusercontent.com/193136/215159508-7cd77625-cc85-438f-b076-b47419dee050.png)

Inspecting the outstanding tasks in Cloud Tasks dashboard:

> ![image](https://user-images.githubusercontent.com/193136/215159550-11ee12de-7fdb-4800-96bc-a764b06bdb0d.png)

## Usage with Zeplo

About [Zeplo](https://zeplo.io/):

- Very easy to configure.
- The free plan allows up to 500 requests per month.
- [Flexible retry policies.](https://www.zeplo.io/docs/retry)
- Provides an easy-to-use dashboard for viewing tasks.
- Allows inspecting the response body and headers.
- Provides a CLI with the [`zeplo dev`](https://www.zeplo.io/docs/cli) simulator that allows local development.

Setting up:

1. Copy the API key

   ![image](https://user-images.githubusercontent.com/193136/215170807-339c49e9-c519-4a1e-8743-33bd314e9a7a.png)

Creating an adapter:

```ts
const adapter = new ZeploAdapter({
  zeploUrl: process.env.ZEPLO_URL,
  url: 'https://.../',
  token: process.env.ZEPLO_TOKEN,
  retry: 3,
})
```

Expected environment variables:

```sh
ZEPLO_TOKEN=

# If you want to test locally with `zeplo dev`, uncomment the next line:
ZEPLO_URL=http://localhost:4747
```

Inspecting requests in the dashboard:

> ![image](https://user-images.githubusercontent.com/193136/215171001-c3f12421-12fd-4966-a018-41d97ed805d0.png)

## Usage with QStash

About [QStash](https://upstash.com/blog/qstash-announcement):

- Very easy to configure.
- The free plan allows up to 500 requests **per day** with maximum 3 retries.
- [Retry count can be configured but the back-off rate is fixed.](https://docs.upstash.com/qstash/features/retry)
- Provides an easy-to-use dashboard for viewing tasks.

Setting up:

1. Copy the API key

   ![image](https://user-images.githubusercontent.com/193136/215170954-104347e2-39bc-4576-b58f-e0ce33d7406e.png)

Creating an adapter:

```ts
const adapter = new QStashAdapter({
  url: 'https://.../',
  token: process.env.QSTASH_TOKEN,
  retry: 3,
})
```

Expected environment variables:

```sh
QSTASH_TOKEN=
```

Inspecting requests in the dashboard:

> ![image](https://user-images.githubusercontent.com/193136/215171051-73a4ae09-70b3-4f62-a13a-8d92dfb4efdd.png)
