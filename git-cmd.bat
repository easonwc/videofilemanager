@echo off
cd /d C:\kiroProjects\videoFileManager\video-manager
git add .
git commit -m v1.6.0-video-clarity-and-metadata-cache
git push origin master
npm run build
echo Done!
