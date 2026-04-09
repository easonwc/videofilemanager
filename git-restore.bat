@echo off
cd /d C:\kiroProjects\videoFileManager\video-manager
git init
git config user.email "willeason2@gmail.com"
git config user.name "William C Eason II"
git remote add origin https://github.com/easonwc/videofilemanager.git
git add .
git commit -m v1.3.0-design-system-reskin
git push origin master --force
echo Done!
