import { DynamoDB, AWSError } from 'aws-sdk'
import { SQS } from 'aws-sdk'
import { ApiGatewayManagementApi } from 'aws-sdk'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

// DynamoDB クライアントの初期化
const dynamodb = new DynamoDB.DocumentClient()
const sessionsTable = 'sessions'

// SQS クライアントの初期化
const sqs = new SQS()

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext?.connectionId
  const created_at = new Date().toISOString()

  try {
    const body = JSON.parse(event.body || '{}')
    const { team_code, user_id, content, content_type } = body

    // メッセージをSQSに送信
    await sqs
      .sendMessage({
        QueueUrl: process.env.AWS_SQS_URL,
        MessageGroupId: team_code,
        MessageBody: JSON.stringify({
          team_code,
          created_at,
          content,
          content_type,
          user_id,
          connection_id: connectionId,
        }),
      })
      .promise()

    const scanParams = {
      TableName: sessionsTable,
      FilterExpression: '#team_code = :team_code',
      ExpressionAttributeNames: {
        '#team_code': 'team_code',
      },
      ExpressionAttributeValues: {
        ':team_code': team_code,
      },
    }

    // DynamoDBからセッション情報を取得
    const { Items = [] } = await dynamodb.scan(scanParams).promise()

    // 全接続ユーザーの情報を作成
    const activeUserIds = Items.map((item) => item.user_id)

    // API Gateway Management APIのインスタンス作成
    const apiGateway = new ApiGatewayManagementApi({
      endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`,
    })

    // メッセージの内容
    const postData = {
      action: 'message',
      data: {
        activeUserIds,
        messages: {
          created_at,
          user_id,
          content,
          content_type,
        },
      },
    }

    // WebSocket経由でメッセージを送信
    const postPromises = Items.flatMap(async (item) => {
      try {
        await apiGateway
          .postToConnection({
            ConnectionId: item.connection_id as string,
            Data: JSON.stringify(postData),
          })
          .promise()
      } catch (err) {
        // 切断された接続を削除
        const awsError = err as AWSError
        if (awsError.statusCode === 410) {
          await dynamodb
            .delete({
              TableName: sessionsTable,
              Key: { connection_id: item.connection_id },
            })
            .promise()
        }
      }
    })

    // 全ての送信タスクを完了させる
    await Promise.all(postPromises)

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Messages processed successfully!' }),
    }
  } catch (error) {
    console.error('Error processing messages:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    }
  }
}
