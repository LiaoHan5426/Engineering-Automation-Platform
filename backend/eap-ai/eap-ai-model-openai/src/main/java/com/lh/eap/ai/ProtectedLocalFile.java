package com.lh.eap.ai;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import com.lh.eap.error.SecurityErrors;

import java.nio.file.*;
import java.nio.file.attribute.*;
import java.util.*;

/** Write credentials atomically; restrict the temporary file before writing any secret. */
final class ProtectedLocalFile {
    static void write(Path target, String content) throws IOException {
        Path parent = target.toAbsolutePath().getParent();
        Files.createDirectories(parent);
        Path temp = Files.createTempFile(parent, ".credentials-", ".tmp");
        try {
            var posix = Files.getFileAttributeView(temp, PosixFileAttributeView.class);
            if (posix != null) posix.setPermissions(PosixFilePermissions.fromString("rw-------"));
            else {
                var acl = Files.getFileAttributeView(temp, AclFileAttributeView.class);
                if (acl == null) throw new IOException(SecurityErrors.PROTECTED_STORE_UNAVAILABLE.code());
                acl.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(Files.getOwner(temp))
                        .setPermissions(EnumSet.allOf(AclEntryPermission.class)).build()));
            }
            Files.writeString(temp, content, StandardCharsets.UTF_8);
            try { Files.move(temp, target.toAbsolutePath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException unsupported) { Files.move(temp, target.toAbsolutePath(), StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temp); }
    }
}
