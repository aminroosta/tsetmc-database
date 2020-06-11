#!/bin/sh

setup_git() {
  git config --global user.email "amin.roosta@outlook.com"
  git config --global user.name "amin roosta"
}

commit_country_json_files() {
  git checkout master
  # Current month and year, e.g: Apr 2018
  dateAndMonth=`date "+%b %Y"`

  # Stage the modified files in dist/output
  git add -f db/

  # Create a new commit with a custom build message
  # with "[skip ci]" to avoid a build loop
  # and Travis build number for reference
  git commit -m "db/ update $dateAndMonth (travis $TRAVIS_BUILD_NUMBER)" -m "[skip ci]"
}

upload_files() {
  # Remove existing "origin"
  git remote rm origin
  # Add new "origin" with access token in the git URL for authentication
  git remote add origin https://aminroosta:${GITHUB_TOKEN}@github.com/aminroosta/tsetmc-database.git > /dev/null 2>&1
  git push origin master --quiet
}

setup_git

commit_country_json_files

# Attempt to commit to git only if "git commit" succeeded
if [ $? -eq 0 ]; then
  echo "A new commit with changed db JSON files exists. Uploading to GitHub"
  upload_files
else
  echo "No changes in db JSON files. Nothing to do"
fi