import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-md border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        warning:
          "border-warning/40 bg-warning/10 text-warning [&>svg]:text-warning",
        destructive:
          "border-destructive/40 bg-destructive/10 text-destructive [&>svg]:text-destructive",
        success:
          "border-success/40 bg-success/10 text-success [&>svg]:text-success",
        info: "border-primary/30 bg-primary/5 text-foreground [&>svg]:text-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const iconMap = {
  default: Info,
  warning: AlertTriangle,
  destructive: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", icon = true, children, ...props }, ref) => {
    const Icon = iconMap[variant ?? "default"];
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {icon && <Icon />}
        {children}
      </div>
    );
  },
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed opacity-90", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
