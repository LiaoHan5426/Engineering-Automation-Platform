"""Plugin package and installation errors."""


class DshPackageError(ValueError):
    pass


class InvalidInstallSpecError(ValueError):
    def __init__(self, spec: str, reason: str) -> None:
        self.spec = spec
        self.reason = reason
        super().__init__(f"{reason}: {spec}")


class InstallFetchError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


class InstallSpecMissingError(ValueError):
    pass
