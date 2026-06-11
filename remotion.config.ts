import { Config } from "@remotion/cli/config";
import os from "node:os";

Config.setConcurrency(Math.max(1, os.cpus().length - 2));
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setAudioCodec("aac");
Config.setPixelFormat("yuv420p");
