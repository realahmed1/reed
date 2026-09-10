import { initializeReader } from "../renderer/reader";
import { createBrowserServices } from "./services";

initializeReader(createBrowserServices());
