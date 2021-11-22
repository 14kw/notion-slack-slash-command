'use strict'
import { App, AwsLambdaReceiver, LogLevel } from '@slack/bolt'
import { Client } from '@notionhq/client'

// Initialize your custom receiver
const awsLambdaReceiver = new AwsLambdaReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
});

// Initializing slack app
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver: awsLambdaReceiver,
    processBeforeResponse: true,
    logLevel: LogLevel.DEBUG
})

// Initializing notin client
const notion = new Client({
    auth: process.env.NOTION_TOKEN
})

// 議事録DatabaseId
const MTG_DBID: string = process.env.MTG_DBID || ''
// 障害対応DatabaseId
const TROUBLESHOOTING_DBID: string = process.env.TROUBLESHOOTING_DBID || ''
// 日報週報DatabaseId
const DWREPORT_DBID: string = process.env.DWREPORT_DBID || ''
// DBキー登録用DatabaseId
const SLACKCONN_DBID: string = process.env.SLACKCONN_DBID || ''

// Slach command `/notion` の応答処理
app.command('/notion', async ({ command, ack, client, respond }) => {
    await ack()
    console.log(command)

    const commandText = command.text
    const commandInputs = commandText ? commandText.split(/\s+/) : []
    const wakeWord = commandInputs.length > 0 ? commandInputs[0] : ''
    // const token = context.botToken

    if (wakeWord === 'help') {
        await respond('`/notion list` 現在のチャンネルに設定されているコマンド名とデータベース\n\
`/notion set {command} {databaseId}` 現在のチャンネルにコマンド名とデータベースを登録する\n\
`/notion del {command}` 現在のチャンネルに登録したコマンド名を削除する\n\
`/notion {command} {summary}` コマンド名に紐付いたデータベースに新しいアイテムを作成する\n\
`/notion (giji|mtg|議事録) {summary}` 新しい議事録を作成する\n\
`/notion (inc|ts|障害報告) {summary}` 新しい障害報告を作成する\n\
`/notion (day|日報|week|週報) {summary}` 新しい日報・週報を作成する')
    } else if (wakeWord === 'set' && commandInputs.length > 2) {
        // wakeWord:set - Upsert notion slack slash command database item
        const databaseKey = commandInputs[1].toLowerCase()
        const databaseId = commandInputs[2]
        const searchKey = command.channel_id + '_' + databaseKey
        const payload = {
            Name: {
                title: [
                    {
                        "text": {
                            "content": searchKey
                        }
                    }
                ]
            },
            SlackChannelName: {
                rich_text: [
                    {
                        "text": {
                            "content": command.channel_name
                        }
                    }
                ]
            },
            SlackChannelId: {
                rich_text: [
                    {
                        "text": {
                            "content": command.channel_id
                        }
                    }
                ]
            },
            DatabaseKey: {
                rich_text: [
                    {
                        "text": {
                            "content": databaseKey
                        }
                    }
                ]
            },
            DatabaseId: {
                rich_text: [
                    {
                        "text": {
                            "content": databaseId
                        }
                    }
                ]
            },
            Creator: {
                rich_text: [
                    {
                        "text": {
                            "content": command.user_name
                        }
                    }
                ]
            },
        }

        const itemData = await searchSlashCommandSetting(SLACKCONN_DBID, searchKey)
        if (itemData === undefined) {
            await addItem(SLACKCONN_DBID, payload)
            try {
                await client.chat.postMessage({
                    channel: command.channel_id,
                    text: 'Create connection: `' + databaseKey + '` to https://www.notion.so/' + databaseId + '\nex: `/notion ' + databaseKey + ' pageTitle`'
                });
            } catch (error) {
                console.error(error);
            }
            await respond(`Succeed: ${command.text}`)
        } else if ('id' in itemData[0]) {
            await updateItem(itemData[0].id, payload)
            try {
                await client.chat.postMessage({
                    channel: command.channel_id,
                    text: 'Update connection: `' + databaseKey + '` to https://www.notion.so/' + databaseId + '\nex: `/notion ' + databaseKey + ' pageTitle`'
                });
            } catch (error) {
                console.error(error);
            }
            await respond(`Succeed: ${command.text}`)
        } else {
            await respond(`Failed: ${command.text}`)
        }
    } else if (wakeWord === 'del' && commandInputs.length > 1) {
        // wakeWord:del - Delete notion slack slask command item
        const databaseKey = commandInputs[1].toLowerCase()
        const searchKey = command.channel_id + '_' + databaseKey
        const itemData = await searchSlashCommandSetting(SLACKCONN_DBID, searchKey)
        if (itemData !== undefined && 'id' in itemData[0]) {
            await archiveItem(itemData[0].id)
            await respond(`Succeed: ${command.text}`)
        } else {
            await respond(`Failed: Not found setting. ${command.text}`)
        }
    } else if (wakeWord === 'list') {
        const itemData = await searchSlashCommandSetting(SLACKCONN_DBID, command.channel_id)
        if (itemData === undefined) {
            await respond(`Not found exist setting`)
        } else {
            const messages = itemData.map((i: any) => { return '`' + getNotionPropertyContent(i.properties.DatabaseKey, 'rich_text') + '` https://www.notion.so/' + getNotionPropertyContent(i.properties.DatabaseId, 'rich_text') })
            try {
                await client.chat.postMessage({
                    channel: command.channel_id,
                    text: 'Notion Database Connection List: \n' + messages.join('\n')
                });
            } catch (error) {
                console.error(error);
            }
        }
    } else if (commandInputs.length > 1) {
        // wakeWord:DBKey - Create database item in database that corresponds to DBKey.
        let targetDatabaseId = ''
        let titleSummary = commandInputs.slice(1).join(' ')
        const today = new Date().toISOString().split('T')[0]
        switch (wakeWord) {
            case 'giji':
            case 'mtg':
            case '議事録':
                targetDatabaseId = MTG_DBID
                titleSummary = today + ' ' + titleSummary
                break
            case 'inc':
            case 'ts':
            case '障害報告':
                targetDatabaseId = TROUBLESHOOTING_DBID
                titleSummary = today + ' ' + titleSummary
                break
            case 'day':
            case '日報':
                targetDatabaseId = DWREPORT_DBID
                titleSummary = today + ' 日報 ' + titleSummary
                break
            case 'week':
            case '週報':
                targetDatabaseId = DWREPORT_DBID
                titleSummary = today + ' 週報 ' + titleSummary
                break
            default:
                const searchKey = command.channel_id + '_' + wakeWord
                const itemData = await searchSlashCommandSetting(SLACKCONN_DBID, searchKey)
                if (itemData !== undefined && 'DatabaseId' in itemData[0].properties) {
                    targetDatabaseId = getNotionPropertyContent(itemData[0].properties.DatabaseId, 'rich_text')
                }
                break
        }
        if (targetDatabaseId !== '') {
            const payload = {
                title: {
                    title: [
                        {
                            "text": {
                                "content": titleSummary
                            }
                        }
                    ]
                }
            }
            const response = await addItem(targetDatabaseId, payload)
            if (response !== undefined) {
                const message = 'New page created: <' + response.url + '|' + titleSummary + '> in <https://www.notion.so/' + replaceAll(response.parent.database_id, '-', '') + '|' + wakeWord + '> by ' + command.user_name
                try {
                    await client.chat.postMessage({
                        channel: command.channel_id,
                        text: message
                    });
                } catch (error) {
                    console.error(error);
                }
            }
            // await respond(`Succeed: ${command.text}`)
        } else {
            await respond(`Failed: Not found database for DBKey.`)
        }
    } else {
        await respond(`Failed: Invalid argument.`)
    }
})

// replaceAll is available in node15 and above.
function replaceAll(str: string, find: string, replace: string) {
    return str.replace(new RegExp(find, 'g'), replace);
}

async function addItem(databaseId: string, payload: any): Promise<any | undefined> {
    try {
        const response = await notion.pages.create({
            parent: { database_id: databaseId },
            properties: payload,
        })
        console.log(response)
        console.log("Success! Entry added.")
        return response
    } catch (error) {
        console.error(error)
        return undefined
    }
}

async function updateItem(pageId: string, payload: any): Promise<any | undefined> {
    try {
        const response = await notion.pages.update({
            page_id: pageId,
            properties: payload
        })
        console.log(response)
        console.log("Success! Entry updated.")
        return response
    } catch (error) {
        console.error(error)
        return undefined
    }
}

function getNotionPropertyContent(value: any, type: string) {
    if (type === 'title') {
        return value.title[0].text.content
    } else if (type === 'rich_text') {
        return value.rich_text[0].text.content
    }
    return undefined
}

// Search for searchKey(channelId + DBKey) in the database and return the first one.
async function searchSlashCommandSetting(databaseId: string, searchKey: string): Promise<any | Error | undefined> {
    try {
        console.log('Start search database')
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                property: "title",
                text: {
                    starts_with: searchKey,
                },
            },
        })
        console.log(response)
        console.log("Success! Entry searched.")
        if (response.results.length > 0) {
            return response.results
        } else {
            return undefined
        }
    } catch (error) {
        console.error(error)
        return new Error("Failed: Notin client error")
    }
}

async function archiveItem(pageId: string) {
    try {
        const response = await notion.pages.update({
            page_id: pageId,
            archived: true
        })
        console.log(response)
        console.log("Success! Entry archived.")
    } catch (error) {
        console.error(error)
    }
}

// (async () => {
//     await app.start(3000)
//     console.log('⚡️ Bolt app is running!')
// })()

// Handle the Lambda function event
module.exports.handler = async (event: any, context: any, callback: any) => {
    const handler = await awsLambdaReceiver.start();
    return handler(event, context, callback);
}