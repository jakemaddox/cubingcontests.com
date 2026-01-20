#!/bin/bash

##################################################
# Script for (re)starting production environment #
##################################################

# $1 - (optional) --restart/-r - skip apt update and DB dump

if [ "$(pwd | tail -c 5)" == "/bin" ]; then
  echo "Please run this script from the repo's root directory"
  exit 1
fi

if [ "$1" != "--restart" ] && [ "$1" != "-r" ]; then
  sudo docker compose -f docker-compose.cc.yml up -d
else
  sudo apt update &&
  sudo apt dist-upgrade &&

  # TO-DO: MAKE DUMPS WORK AGAIN!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  # ./bin/dump-db.sh /dump

  sudo docker compose -f docker-compose.cc.yml restart nextjs
fi
