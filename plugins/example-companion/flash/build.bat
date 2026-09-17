@echo off
setlocal
REM Rebuild assets\boxmover.swf from BoxMover.as using Apache Flex mxmlc.
REM Expects Flex SDK at work\flex-sdk (or set FLEX_HOME).

if "%FLEX_HOME%"=="" set "FLEX_HOME=%~dp0..\..\..\work\flex-sdk"
if not exist "%FLEX_HOME%\bin\mxmlc.bat" (
  echo FLEX_HOME not found: %FLEX_HOME%
  echo Download Apache Flex SDK binaries and place playerglobal.swc under frameworks\libs\player\32.0\
  exit /b 1
)

"%FLEX_HOME%\bin\mxmlc.bat" ^
  -target-player=32.0 ^
  -swf-version=32 ^
  -default-size 550 400 ^
  -default-background-color=0x121212 ^
  -default-frame-rate=24 ^
  -static-link-runtime-shared-libraries=true ^
  -output "%~dp0..\assets\boxmover.swf" ^
  "%~dp0BoxMover.as"

if errorlevel 1 exit /b 1
echo Built %~dp0..\assets\boxmover.swf
endlocal
