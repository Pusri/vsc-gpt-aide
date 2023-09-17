import * as vscode from 'vscode';
import { ChatGPTUnofficialProxyAPI } from 'chatgpt';


export function activate(context: vscode.ExtensionContext) {
	// 获取插件配置
	const config = vscode.workspace.getConfiguration('gptaide');
	const sessionToken = config.get('sessionToken') as string|undefined;
	console.info('获取配置：', sessionToken);

	// 创建实例
	const provider = new ChatGPTViewProvider(context.extensionUri);
	provider.setSessionToken(sessionToken);

	// 读取配置
	provider.selectedInsideCodeblock = config.get('selectedInsideCodeblock') || false;
	provider.pasteOnClick = config.get('pasteOnClick') || false;
	provider.keepConversation = config.get('keepConversation') || false;
	provider.timeoutLength = config.get('timeoutLength') || 60;

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatGPTViewProvider.viewType, provider,  {
			webviewOptions: { retainContextWhenHidden: true }
		})
	);



	// 注册命令
	const commandHandler = (command:string) => {
		const config = vscode.workspace.getConfiguration('gptaide');
		const prompt = config.get(command) as string;
		provider.search(prompt);
	};

	const commandAsk = vscode.commands.registerCommand('gptaide.ask', () => {
		vscode.window.showInputBox({ prompt: '在这里输入问题?' }).then((value) => {
			provider.search(value);
		});
	});
	const commandConversationId = vscode.commands.registerCommand('gptaide.conversationId', () => {
		vscode.window.showInputBox({ 
			prompt: 'Set Conversation ID or delete it to reset the conversation',
			placeHolder: 'conversationId (leave empty to reset)',
			value: provider.getConversationId()
		}).then((conversationId) => {
			if (!conversationId) {
				provider.setConversationId();
			} else {
				vscode.window.showInputBox({ 
					prompt: 'Set Parent Message ID',
					placeHolder: 'messageId (leave empty to reset)',
					value: provider.getParentMessageId()
				}).then((messageId) => {
					provider.setConversationId(conversationId, messageId);
				});
			}
		});
	});
	const commandExplain = vscode.commands.registerCommand('gptaide.explain', () => {	
		commandHandler('promptPrefix.explain');
	});
	const commandRefactor = vscode.commands.registerCommand('gptaide.refactor', () => {
		commandHandler('promptPrefix.refactor');
	});
	const commandOptimize = vscode.commands.registerCommand('gptaide.optimize', () => {
		commandHandler('promptPrefix.optimize');
	});
	const commandProblems = vscode.commands.registerCommand('gptaide.findProblems', () => {
		commandHandler('promptPrefix.findProblems');
	});

	let commandResetConversation = vscode.commands.registerCommand('gptaide.resetConversation', () => {
		provider.setConversationId();
	});
	

	context.subscriptions.push(commandAsk, commandConversationId, commandExplain, commandRefactor, commandOptimize, commandProblems, commandResetConversation);



	// 更改配置时更改会话token
	vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
		if (event.affectsConfiguration('gptaide.sessionToken')) {
			// 获取插件配置
			const config = vscode.workspace.getConfiguration('gptaide');
			const sessionToken = config.get('sessionToken') as string|undefined;
			console.info('获取配置：', sessionToken);
			//设置token
			provider.setSessionToken(sessionToken);

		} else if (event.affectsConfiguration('gptaide.selectedInsideCodeblock')) {
			const config = vscode.workspace.getConfiguration('gptaide');
			provider.selectedInsideCodeblock = config.get('selectedInsideCodeblock') || false;

		} else if (event.affectsConfiguration('gptaide.pasteOnClick')) {
			const config = vscode.workspace.getConfiguration('gptaide');
			provider.pasteOnClick = config.get('pasteOnClick') || false;

		} else if (event.affectsConfiguration('gptaide.keepConversation')) {
			const config = vscode.workspace.getConfiguration('gptaide');
			provider.keepConversation = config.get('keepConversation') || false;

		}else if (event.affectsConfiguration('gptaide.timeoutLength')) {
			const config = vscode.workspace.getConfiguration('gptaide');
			provider.timeoutLength = config.get('timeoutLength') || 60;
		}
});
}





class ChatGPTViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gptaide.chatView';

	private _view?: vscode.WebviewView;

	// 此变量包含对 ChatGPTAPI 实例的引用
	private _chatGPTAPI?: ChatGPTUnofficialProxyAPI ;
	// private _conversation?: ChatGPTConversation;

	private _response?: string;
	private _prompt?: string;
	private _fullPrompt?: string;


	public selectedInsideCodeblock = false;
	public pasteOnClick = true;
	public keepConversation = true;
	public timeoutLength = 60;
	private _sessionToken?: string;

	// 在构造函数中，存储扩展的 URI
	constructor(private readonly _extensionUri: vscode.Uri) {
		
	}
	
	// 设置会话token并基于此token创建新的 API 实例
	public setSessionToken(sessionToken?: string) {
		this._sessionToken = sessionToken;
		this._newAPI();
	}

	public setConversationId(conversationId?: string, parentMessageId?: string) {
		if (!conversationId || !parentMessageId) {
			// this._conversation = this._chatGPTAPI?.getConversation();
		} else if (conversationId && parentMessageId) {
			// this._conversation = this._chatGPTAPI?.getConversation({conversationId: conversationId, parentMessageId: parentMessageId});
		}
	}

	public getConversationId() {
		// return this._conversation?.conversationId;
		return '';
	}
	public getParentMessageId() {
		// return this._conversation?.parentMessageId;
		return '';
	}

	// 此私有方法初始化新的 ChatGPTAPI 实例，如果设置了sessionToken，则使用
	private _newAPI() {
		if (!this._sessionToken) {
			console.warn("Session token not set");
		}else{
			this._chatGPTAPI = new ChatGPTUnofficialProxyAPI ({
				accessToken: this._sessionToken,
				apiReverseProxyUrl: 'https://ai.fakeopen.com/api/conversation'
			});
			// this._conversation = this._chatGPTAPI.getConversation();
		}
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		// 设置webview
		webviewView.webview.options = {
			// 允许webview script
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		// 设置html
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// 为 Webview接收的消息添加事件侦听器
		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'codeSelected':
					{
						if (!this.pasteOnClick) {
							break;
						}

						let code = data.value;
						code = code.replace(/([^\\])(\$)([^{0-9])/g, "$1\\$$$3");

						// 将代码作为代码片段插入活动文本编辑器
						vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(code));
						break;
					}
				case 'prompt':
					{
						this.search(data.value);
					}
			}
		});
	}



	public async search(prompt?:string) {
		this._prompt = prompt;
		if (!prompt) {
			prompt = '';
		};

		// 检查是否定义了聊天GPTAPI实例
		if (!this._chatGPTAPI) {
			this._newAPI();
		}

		// 从活动栏聚焦 GPT 活动
		if (!this._view) {
			await vscode.commands.executeCommand('gptaide.chatView.focus');
		} else {
			this._view?.show?.(true);
		}
		
		let response = '';

		// 获取选中文本
		const selection = vscode.window.activeTextEditor?.selection;
		const selectedText = vscode.window.activeTextEditor?.document.getText(selection);
		let searchPrompt = '';

		if (selection && selectedText) {
			// 选中代码添加prompt
			if (this.selectedInsideCodeblock) {
				searchPrompt = `${prompt}\n\`\`\`\n${selectedText}\n\`\`\``;
			} else {
				searchPrompt = `${prompt}\n${selectedText}\n`;
			}
		} else {
			// 未选中代码只发送prompt
			searchPrompt = prompt;
		}

		this._fullPrompt = searchPrompt;


		if (!this._chatGPTAPI) {
			response = '[ERROR] Please enter an API key in the extension settings';
		} else {
			console.log("sendMessage");
			
			this._view?.webview.postMessage({ type: 'setPrompt', value: this._prompt });

			if (this._view) {
				this._view.webview.postMessage({ type: 'addResponse', value: '...' });
			}

			// let agent;
			// if (this.keepConversation) {
			// 	// agent = this._conversation;
			// } else {
			// 	agent = this._chatGPTAPI;
			// }

			try {
				// 将prompt发送到 ChatGPTAPI 实例并存储响应
				const res = await this._chatGPTAPI.sendMessage(searchPrompt, {
					onProgress: (partialResponse: any) => {
						if (this._view && this._view.visible) {
							this._view.webview.postMessage({ type: 'addResponse', value: partialResponse });
						}
					},
					timeoutMs: this.timeoutLength * 1000
				});
				response = res.text;
			} catch (e) {
				console.error(e);
				response = `[ERROR] ${e}`;
			}
		}

		// 存储响应
		this._response = response;

		// 显示视图并向 Webview 发送包含响应的消息
		if (this._view) {
			this._view.show?.(true);
			this._view.webview.postMessage({ type: 'addResponse', value: response });
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const microlightUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'microlight.min.js'));
		const tailwindUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'showdown.min.js'));
		const showdownUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'tailwind.min.js'));

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<script src="${tailwindUri}"></script>
				<script src="${showdownUri}"></script>
				<script src="${microlightUri}"></script>
				<style>
				.code {
					white-space : pre;
				</style>
			</head>
			<body>
				<input class="h-10 w-full text-white bg-stone-700 p-4 text-sm" type="text" id="prompt-input" />

				<div id="response" class="pt-6 text-sm">
				</div>

				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

// 停用扩展时调用此方法
export function deactivate() {}