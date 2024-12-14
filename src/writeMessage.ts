import { DynamoDB } from 'aws-sdk'
import { SQSEvent } from 'aws-lambda'

interface Body {
  team_code: string
  created_at: string
  content: string
  content_type: string
  user_id: string
  connection_id: string
}

// DynamoDBクライアントの初期化
const dynamoDb = new DynamoDB.DocumentClient()
const messagesTable = 'messages'

export const handler = async (event: SQSEvent) => {
  try {
    for (const record of event.Records) {
      // SQSメッセージの本文を取得
      const Item = JSON.parse(record.body) as Body

      // chatテーブルにデータを挿入
      await dynamoDb
        .put({
          TableName: messagesTable,
          Item,
        })
        .promise()
    }

    return {
      statusCode: 200,
      body: 'The message is saved in DynamoDB!',
    }
  } catch (error) {
    console.error('Error writing to DynamoDB or processing messages:', error)
    return {
      statusCode: 500,
      body: 'An error occurred while processing the message.',
    }
  }
}
