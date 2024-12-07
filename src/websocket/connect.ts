import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

// DynamoDB クライアントの初期化
const dynamodb = new DynamoDB.DocumentClient()
const sessionsTable = 'sessions'

// Lambda ハンドラー
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext?.connectionId
  const teamCode = event.queryStringParameters?.team_code
  const userId = event.queryStringParameters?.user_id

  if (!teamCode || !userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Error: team_code and user_id are required.',
      }),
    }
  }

  const putParams = {
    TableName: sessionsTable,
    Item: {
      connection_id: connectionId,
      team_code: teamCode,
      user_id: userId,
    },
  }

  try {
    // 接続情報を保存
    await dynamodb.put(putParams).promise()

    const scanParams = {
      TableName: sessionsTable,
      FilterExpression: '#attribute = :value',
      ExpressionAttributeNames: {
        '#attribute': 'team_code',
      },
      ExpressionAttributeValues: {
        ':value': teamCode,
      },
    }

    // DynamoDBからセッション情報を取得
    const { Items } = await dynamodb.scan(scanParams).promise()

    if (!Items || Items.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: 'No active connections found.' }),
      }
    }

    // API Gateway Management APIのインスタンス作成
    const apiGateway = new ApiGatewayManagementApi({
      endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`,
    })

    // 全接続ユーザーの情報を作成
    const activeUserIds = Items.map((item) => item.user_id)

    // WebSocket 経由でメッセージを送信
    const postPromises = Items.flatMap(async (item) => {
      // 確実に接続の完了が保証されていないので、自身のconnection_idは除外
      if (item.connection_id === connectionId) return Promise.resolve([])

      try {
        return apiGateway
          .postToConnection({
            ConnectionId: item.connection_id as string,
            Data: JSON.stringify({ action: 'connect', activeUserIds }),
          })
          .promise()
      } catch (err) {
        console.error(`Failed to send message to ${item.connection_id}:`, err)
      }
    })

    // 全ての送信タスクを完了させる
    await Promise.all(postPromises)

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connection successful!' }),
    }
  } catch (err) {
    console.error('Error:', err)

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process connection.' }),
    }
  }
}
