"""Build the dependency-free local VSIX, without npm or a global tool install."""
from pathlib import Path
import json
import zipfile
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
package = json.loads((root / "package.json").read_text())
ns = "http://schemas.microsoft.com/developer/vsx-schema/2011"
manifest = ET.Element("PackageManifest", Version="2.0.0", xmlns=ns)
metadata = ET.SubElement(manifest, "Metadata")
ET.SubElement(metadata, "Identity", Language="en-US", Id=package["name"], Version=package["version"], Publisher=package["publisher"])
ET.SubElement(metadata, "DisplayName").text = package["displayName"]
ET.SubElement(metadata, "Description").text = package["description"]
if package.get("icon"):
    ET.SubElement(metadata, "Icon").text = "extension/" + package["icon"]
ET.SubElement(metadata, "Tags")
ET.SubElement(metadata, "Categories").text = "Other"
properties = ET.SubElement(metadata, "Properties")
ET.SubElement(properties, "Property", Id="Microsoft.VisualStudio.Code.Engine", Value=package["engines"]["vscode"])
ET.SubElement(properties, "Property", Id="Microsoft.VisualStudio.Code.ExtensionKind", Value="workspace")
ET.SubElement(properties, "Property", Id="Microsoft.VisualStudio.Code.LocalizedLanguages", Value="")
installation = ET.SubElement(manifest, "Installation")
ET.SubElement(installation, "InstallationTarget", Id="Microsoft.VisualStudio.Code")
ET.SubElement(manifest, "Dependencies")
assets = ET.SubElement(manifest, "Assets")
ET.SubElement(assets, "Asset", Type="Microsoft.VisualStudio.Code.Manifest", Path="extension/package.json", Addressable="true")
if package.get("icon"):
    ET.SubElement(assets, "Asset", Type="Microsoft.VisualStudio.Services.Icons.Default", Path="extension/" + package["icon"], Addressable="true")
content_types = '''<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="png" ContentType="image/png"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'''
output = root / "dist" / f"{package['name']}-{package['version']}.vsix"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("extension.vsixmanifest", ET.tostring(manifest, encoding="utf-8", xml_declaration=True))
    archive.writestr("[Content_Types].xml", content_types)
    for name in ("package.json", "extension.js", "core.js", "settings.js", "README.md", "README.zh-CN.md", "CHANGELOG.md", "LICENSE"):
        archive.write(root / name, "extension/" + name)
    if package.get("icon"):
        archive.write(root / package["icon"], "extension/" + package["icon"])
print(output)
