import { Identifier, ActionInitOpt } from "./types";
import config, { ConfigParser } from "./configuration";
import { Promisified } from "@/proxy/renderer";
import { ActionManager } from "./action";
import bus from "./event-bus";

const isMain = process.type == "browser";

type Handler1 = () => void;
type Handler2 = (controller: MainController | RenController) => void;

export type Handler = Handler1 | Handler2;

type Args = {
  identifier: Identifier;
  param: any;
  type: ActionInitOpt["actionType"];
  isMain: boolean;
};

export abstract class CommonController {
  config: ConfigParser = config;
  action: ActionManager = new ActionManager(config);

  links: Map<Identifier, Handler>[] = [];
  abstract handle(identifier: Identifier, param: any[]): boolean;

  constructor() {
    this.action.init();
    this.bind();
  }

  get<T>(identifier: Identifier): T {
    return this.config.get(identifier) as T;
  }

  set(identifier: Identifier, value: any): boolean {
    if (this.config.checkValid(identifier, value)) {
      bus.gat("preSet", identifier, value);
      //这里已经检查过了，所以不用再检查了
      return this.config.set(identifier, value, false);
    } else {
      return false;
    }
  }

  bindLinks(handlers: Map<Identifier, Handler>) {
    this.links.push(handlers);
  }

  handleWithLinks(identifier: Identifier, param: any): boolean {
    if (param != undefined) {
      return false;
    }
    for (const handlers of this.links) {
      if (handlers.has(identifier)) {
        (handlers.get(identifier) as Handler)(this);
        return true;
      }
    }
    return false;
  }

  bind() {
    bus.gon("callback", (args: Args) => {
      const { identifier, param, type: actionType, isMain: main } = args;
      console.debug("action triggered", identifier, param, actionType, main);
      switch (actionType) {
        case "normal":
          if (
            !(
              this.handleWithLinks(identifier, param) ||
              this.handle(identifier, param)
            ) &&
            main == isMain
          ) {
            //跨进程动作，防止出现回声
            bus.iat("callback", args);
          }
          break;
        case "submenu":
        case "constant":
        case "config":
        case "multi_select":
          this.set(identifier, param);
          break;
        case "checkbox":
          if (param == undefined) {
            this.set(identifier, !this.get(identifier));
          } else {
            if (typeof param == "boolean") {
              this.set(identifier, param);
            } else {
              throw `invalid type of param for ${identifier}, the value is ${param}, the type if ${typeof param}`;
            }
          }
          break;
        default:
          throw `Unhandled Action Type <${actionType}>`;
      }
    });
  }
}

export abstract class MainController extends CommonController {}

export abstract class RenController extends CommonController {
  abstract proxy: Promisified<MainController>;
}
