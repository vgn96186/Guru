import re

def fix():
    with open('src/screens/SettingsScreen.tsx', 'r') as f:
        content = f.read()

    # Find all const/let declarations inside SettingsScreen but before allProps
    
    # We will just replace allProps = { ... } with allProps = { ... } that doesn't include the ones that TS complained about, and add the correct ones.
    
    replacements = {
        "githubConnecting": "githubCopilotConnecting",
        "githubDeviceCode": "githubCopilotDeviceCode",
        "gitlabConnecting": "gitlabDuoConnecting",
        "gitlabPendingSession": "gitlabDuoPendingSession",
        "handleGitLabCustomInstanceUrlConnect": "", # Remove or fix
        "hasPoeKey": "",
        "hasPoeConnectedAccount": "",
        "connectPoeProvider": "",
        "hasQwenKey": "",
        "hasQwenConnectedAccount": "",
        "connectQwenProvider": "",
        "setOpenrouterKey": "",
        "setGroqApiKey": "",
        "setGeminiApiKey": "",
        "setGithubModelsToken": "",
        "setLocalAiEnabled": "",
        "testLocalLlm": "",
        "startLocalLlmDownload": "",
        "testLocalWhisper": "",
        "startLocalWhisperDownload": "",
        "isDownloadingLocalModel": "",
        "localModelProgress": "",
        "hasAnyLocalModelInProgress": "",
        "testProviderConnection": "",
        "providerTestStatuses": ""
    }

    match = re.search(r'  const allProps = \{([^}]*)\};', content, re.DOTALL)
    if match:
        props_str = match.group(1)
        for old, new_var in replacements.items():
            if new_var == "":
                props_str = re.sub(r'\b' + old + r'\b,?', '', props_str)
            else:
                props_str = re.sub(r'\b' + old + r'\b', new_var, props_str)
        
        # Replace multiple commas
        props_str = re.sub(r',\s*,', ',', props_str)
        
        new_content = content[:match.start()] + '  const allProps = {' + props_str + '};' + content[match.end():]
        with open('src/screens/SettingsScreen.tsx', 'w') as f:
            f.write(new_content)
        print("Fixed allProps")

fix()
