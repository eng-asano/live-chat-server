import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

// DynamoDBクライアントの初期化
const dynamodb = new DynamoDB.DocumentClient()
const sessionsTable = 'sessions'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext?.connectionId

  if (!connectionId) {
    return {
      statusCode: 400,
      body: 'Missing connectionId in the request context.',
    }
  }

  const params = {
    TableName: sessionsTable,
    Key: {
      connection_id: connectionId,
    },
  }

  try {
    const target = await dynamodb.get(params).promise()

    // 接続情報を削除
    await dynamodb.delete(params).promise()

    // クエリ用のパラメータを設定
    const scanParams = {
      TableName: sessionsTable,
      FilterExpression: '#attribute = :value',
      ExpressionAttributeNames: {
        '#attribute': 'team_code',
      },
      ExpressionAttributeValues: {
        ':value': target.Item?.team_code,
      },
    }

    // DynamoDBからセッション情報を取得
    const { Items } = await dynamodb.scan(scanParams).promise()

    if (!Items || Items.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No active connections found.' }),
      }
    }

    // API Gateway Management APIのインスタンス作成
    const apiGateway = new ApiGatewayManagementApi({
      endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`,
    })

    // 全接続ユーザーの情報を作成
    const activeUserIds = Items.map((item) => item.user_id)

    // WebSocket 経由でメッセージを送信
    const postPromises = Items.map(async (item) => {
      // 確実に接続が残っていると保証されていないので、自身のconnection_idは除外
      // if (item.connection_id === connectionId) return Promise.resolve([])

      try {
        return apiGateway
          .postToConnection({
            ConnectionId: item.connection_id as string,
            Data: JSON.stringify({ action: 'disconnect', activeUserIds }),
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
      body: 'Disconnection and session removal successful!',
    }
  } catch (error) {
    console.error('Error:', error)

    return {
      statusCode: 500,
      body: 'Failed to process disconnection.',
    }
  }
}
