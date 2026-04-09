@echo off
cd /d C:\kiroProjects\videoFileManager\video-manager
git add .
git commit -m v1.4.0-installer-rebuild
git push origin master
echo Done!
