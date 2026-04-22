import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

new_test = """  async function testVertexKey() {
    const p = vertexAiProject.trim() || profile?.vertexAiProject || '';
    const l = vertexAiLocation.trim() || profile?.vertexAiLocation || '';
    const t = vertexAiToken.trim() || profile?.vertexAiToken || '';
    if (!p || !l || !t) {
      showWarning('Missing info', 'Project, Location, and Token required.');
      return;
    }
    setTestingVertexKey(true);
    setVertexKeyTestResult(null);
    const res = await testVertexConnection(p, l, t);
    setVertexKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('vertex', t);
    else clearProviderValidated('vertex');
    setTestingVertexKey(false);
  }"""

content = re.sub(
    r"  async function testVertexKey\(\) \{\n    setTestingVertexKey\(true\);\n    setVertexKeyTestResult\(null\);\n    try \{\n      const p = vertexAiProject.trim\(\) \|\| profile\?\.vertexAiProject \|\| '';\n      const l = vertexAiLocation.trim\(\) \|\| profile\?\.vertexAiLocation \|\| '';\n      const t = vertexAiToken.trim\(\) \|\| profile\?\.vertexAiToken \|\| '';\n      const res = await testVertexConnection\(p, l, t\);\n      if \(res\.ok\) \{\n        setVertexKeyTestResult\('ok'\);\n        setApiValidation\(markValidationOk\(profile\?\.apiValidation, 'vertex', t\)\);\n      \} else \{\n        setVertexKeyTestResult\('fail'\);\n      \}\n    \} catch \{\n      setVertexKeyTestResult\('fail'\);\n    \} finally \{\n      setTestingVertexKey\(false\);\n    \}\n  \}",
    new_test,
    content
)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
