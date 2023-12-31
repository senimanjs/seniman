#!/bin/bash

# Check if a version argument is provided
if [ -z "$1" ]; then
    echo "Please provide a version number. Usage: update-subfolders {version}"
    exit 1
fi

VERSION=$1

# Save the current directory
PARENT_DIR=$(pwd)

# Iterate through each subfolder
for d in */ ; do
    # Check if package.json exists in the subfolder
    if [[ -f "${PARENT_DIR}/${d}package.json" ]]; then
        echo "Updating seniman to version $VERSION in $d"
        # Navigate to the directory
        cd "${PARENT_DIR}/${d}"
        # Update seniman version
        npm install seniman@"$VERSION" --save
        # Navigate back to the parent directory
        cd "$PARENT_DIR"
    else
        echo "No package.json found in $d, skipping"
    fi
done

echo "Update complete."

