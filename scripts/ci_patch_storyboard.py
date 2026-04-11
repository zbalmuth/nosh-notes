#!/usr/bin/env python3
"""
Patches Main.storyboard to use MyViewController instead of CAPBridgeViewController.
"""
import sys

STORYBOARD = "ios/App/App/Base.lproj/Main.storyboard"

with open(STORYBOARD, "r") as f:
    content = f.read()

if "MyViewController" in content:
    print("Storyboard already patched — skipping.")
    sys.exit(0)

content = content.replace(
    'customClass="CAPBridgeViewController" customModule="Capacitor"',
    'customClass="MyViewController" customModule="App" customModuleProvider="target"'
)

with open(STORYBOARD, "w") as f:
    f.write(content)

print("Patched Main.storyboard to use MyViewController")
