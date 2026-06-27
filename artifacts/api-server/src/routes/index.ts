import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import customersRouter from "./customers";
import rmPricesRouter from "./rm-prices";
import rmOffsetsRouter from "./rm-offsets";
import quotesRouter from "./quotes";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(customersRouter);
router.use(rmPricesRouter);
router.use(rmOffsetsRouter);
router.use(quotesRouter);
router.use(dashboardRouter);

export default router;
