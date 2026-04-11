#!/usr/bin/env python3
"""
Registers MyViewController.swift in ios/App/App.xcodeproj/project.pbxproj.
Adds: PBXFileReference, PBXBuildFile, group children entry, Sources build phase entry.
"""
import re
import sys

PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj"

FILE_REF_UUID  = "AA000001000000000000001"
BUILD_FILE_UUID = "AA000001000000000000002"
FILENAME = "MyViewController.swift"

with open(PBXPROJ, "r") as f:
    content = f.read()

# Skip if already registered
if FILENAME in content:
    print(f"{FILENAME} already registered — skipping.")
    sys.exit(0)

# 1. Add PBXFileReference
file_ref = (
    f"\t\t{FILE_REF_UUID} = {{isa = PBXFileReference; "
    f"lastKnownFileType = sourcecode.swift; name = {FILENAME}; "
    f"path = App/{FILENAME}; sourceTree = \"<group>\"; }};\n"
)
content = re.sub(
    r"(\/\* Begin PBXFileReference section \*\/\n)",
    r"\1" + file_ref,
    content
)

# 2. Add PBXBuildFile
build_file = (
    f"\t\t{BUILD_FILE_UUID} = {{isa = PBXBuildFile; "
    f"fileRef = {FILE_REF_UUID} /* {FILENAME} */; }};\n"
)
content = re.sub(
    r"(\/\* Begin PBXBuildFile section \*\/\n)",
    r"\1" + build_file,
    content
)

# 3. Add to App group children (find the group containing AppDelegate.swift)
content = re.sub(
    r"(AppDelegate\.swift \*\/,\n)",
    r"\1" + f"\t\t\t\t{FILE_REF_UUID} /* {FILENAME} */,\n",
    content
)

# 4. Add to Sources build phase (find AppDelegate.swift build file reference)
content = re.sub(
    r"(AppDelegate\.swift in Sources \*\/,\n)",
    r"\1" + f"\t\t\t\t{BUILD_FILE_UUID} /* {FILENAME} in Sources */,\n",
    content
)

with open(PBXPROJ, "w") as f:
    f.write(content)

print(f"Registered {FILENAME} in project.pbxproj")
